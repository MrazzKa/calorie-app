import { S3Client } from '@aws-sdk/client-s3';

export function makeS3() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || 'us-east-1';
  const accessKeyId = process.env.S3_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY!;
  const forcePathStyle = String(process.env.S3_FORCE_PATH_STYLE || 'true') === 'true';

  return new S3Client({
    region,
    endpoint,
    forcePathStyle, // важно для MinIO
    credentials: { accessKeyId, secretAccessKey },
  });
}

