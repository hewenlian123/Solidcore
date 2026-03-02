import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";

type UploadResult = {
  url: string;
  path: string;
};

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadBinary(
  fileBuffer: Buffer,
  fileName: string,
  bucketFolder: string,
  contentType: string,
): Promise<UploadResult> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "attachments";

  const normalizedFileName = `${Date.now()}-${randomUUID()}-${sanitizeName(fileName)}`;
  const key = `${bucketFolder}/${normalizedFileName}`;

  if (supabaseUrl && supabaseServiceRole) {
    const supabase = createClient(supabaseUrl, supabaseServiceRole);
    const { error } = await supabase.storage
      .from(supabaseBucket)
      .upload(key, fileBuffer, { contentType, upsert: false });
    if (!error) {
      const { data } = supabase.storage.from(supabaseBucket).getPublicUrl(key);
      return { url: data.publicUrl, path: key };
    }
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", bucketFolder);
  await mkdir(uploadDir, { recursive: true });
  const localPath = path.join(uploadDir, normalizedFileName);
  await writeFile(localPath, fileBuffer);
  return {
    url: `/uploads/${bucketFolder}/${normalizedFileName}`,
    path: key,
  };
}
