"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 5 * 1024 * 1024;

export function ProfileImageForm({ currentImage }: { currentImage: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(formData: FormData) {
    const file = formData.get("profileImage");
    if (!(file instanceof File) || file.size === 0) return;
    if (!acceptedTypes.has(file.type) || file.size > maxBytes) {
      setMessage("Choose a JPEG, PNG, or WebP image up to 5 MB.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Sign in again to update your profile image.");
      const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const validSignature = file.type === "image/jpeg"
        ? signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
        : file.type === "image/png"
          ? signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47
          : String.fromCharCode(...signature.slice(0, 4)) === "RIFF" && String.fromCharCode(...signature.slice(8, 12)) === "WEBP";
      if (!validSignature) throw new Error("The selected file does not match its image type.");
      const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const objectKey = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("profile-images").upload(objectKey, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) throw new Error("The image could not be uploaded.");
      const { data: asset, error: assetError } = await supabase.from("media_assets").insert({
        asset_type: "profile_picture",
        provider: "supabase_storage",
        bucket: "profile-images",
        object_key: objectKey,
        mime_type: file.type,
        byte_size: file.size,
        created_by: user.id,
      }).select("id").single();
      if (assetError) throw new Error("The image record could not be saved.");
      const { error: profileError } = await supabase.from("profiles").update({ profile_picture_asset_id: asset.id }).eq("id", user.id);
      if (profileError) throw new Error("Your profile could not be updated with this image.");
      setMessage("Profile image updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile image could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  return <form action={upload} className="profile-image-form"><label>Profile image{currentImage && <img src={currentImage} alt="Current profile" className="profile-image-preview" />}<input name="profileImage" type="file" accept="image/jpeg,image/png,image/webp" required /></label><button className="secondary" type="submit" disabled={busy}>{busy ? "Uploading…" : "Upload image"}</button>{message && <p role="status">{message}</p>}</form>;
}
