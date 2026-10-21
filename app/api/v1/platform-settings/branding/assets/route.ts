import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { requirePlatformAdmin } from "@/lib/authz";
export const runtime = "nodejs";
const MAX_BYTES = 2 * 1024 * 1024;
const types = new Set(["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"]);
function sniff(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return "image/png";
  if (bytes.length >= 3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP") return "image/webp";
  if (bytes.length >= 4 && bytes[0]===0 && bytes[1]===0 && bytes[2]===1 && bytes[3]===0) return "image/x-icon";
  return null;
}
export async function POST(request: NextRequest) {
  const access = await requirePlatformAdmin();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  const bucket=process.env.S3_BUCKET, keyId=process.env.S3_ACCESS_KEY_ID, secret=process.env.S3_SECRET_ACCESS_KEY, publicBase=process.env.S3_PUBLIC_BASE_URL;
  if (!bucket || !keyId || !secret || !publicBase) return NextResponse.json({ error: "Asset storage is not configured." }, { status: 503 });
  const form = await request.formData(), file = form.get("file"), purpose = form.get("purpose");
  if (!(file instanceof File) || (purpose!=="logo" && purpose!=="favicon")) return NextResponse.json({ error: "File and purpose are required." }, { status: 400 });
  if (!file.size || file.size > MAX_BYTES) return NextResponse.json({ error: "Maximum image size is 2 MB." }, { status: 413 });
  if (!types.has(file.type)) return NextResponse.json({ error: "Unsupported image type." }, { status: 415 });
  const bytes = new Uint8Array(await file.arrayBuffer()), actual = sniff(bytes);
  if (!actual || (actual!==file.type && !(actual==="image/x-icon" && file.type==="image/vnd.microsoft.icon"))) return NextResponse.json({ error: "Image signature mismatch." }, { status: 415 });
  const ext=actual==="image/jpeg"?"jpg":actual==="image/x-icon"?"ico":actual.split("/")[1];
  const key="platform-branding/"+purpose+"/"+randomUUID()+"."+ext;
  const s3=new S3Client({region:process.env.S3_REGION||"auto",endpoint:process.env.S3_ENDPOINT||undefined,forcePathStyle:process.env.S3_FORCE_PATH_STYLE==="true",credentials:{accessKeyId:keyId,secretAccessKey:secret}});
  await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:actual,CacheControl:"public, max-age=300"}));
  return NextResponse.json({data:{url:publicBase.replace(/\/$/,"")+"/"+key,key,contentType:actual,size:file.size}},{headers:{"Cache-Control":"no-store"}});
}
