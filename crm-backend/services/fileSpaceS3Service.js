const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const required = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Не задана серверная настройка ${name}`);
  return value;
};

let client;
const getClient = () => {
  if (!client) {
    client = new S3Client({
      endpoint: required('FILESPACE_S3_ENDPOINT'),
      region: process.env.FILESPACE_S3_REGION || 'ru1',
      forcePathStyle: String(process.env.FILESPACE_S3_FORCE_PATH_STYLE || 'true') === 'true',
      // Для S3-совместимых хранилищ не добавляем новые checksum-параметры AWS,
      // если конкретная операция их не требует.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: required('FILESPACE_S3_ACCESS_KEY'),
        secretAccessKey: required('FILESPACE_S3_SECRET_KEY'),
      },
    });
  }
  return client;
};

const bucket = () => required('FILESPACE_S3_BUCKET');
const signedUrlTtl = () => Math.min(Math.max(Number(process.env.FILESPACE_SIGNED_URL_TTL || 900), 60), 3600);

const createUploadUrl = ({ objectKey, contentType }) => getSignedUrl(
  getClient(),
  new PutObjectCommand({
    Bucket: bucket(),
    Key: objectKey,
    ContentType: contentType,
  }),
  { expiresIn: signedUrlTtl() }
);

const putObject = ({ objectKey, body, contentType, contentLength }) => getClient().send(new PutObjectCommand({
  Bucket: bucket(),
  Key: objectKey,
  Body: body,
  ContentType: contentType,
  ContentLength: contentLength,
}));

const createDownloadUrl = ({ objectKey, fileName }) => getSignedUrl(
  getClient(),
  new GetObjectCommand({
    Bucket: bucket(),
    Key: objectKey,
    ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  }),
  { expiresIn: signedUrlTtl() }
);

const createViewUrl = ({ objectKey }) => getSignedUrl(
  getClient(),
  new GetObjectCommand({
    Bucket: bucket(),
    Key: objectKey,
  }),
  { expiresIn: signedUrlTtl() }
);

const headObject = (objectKey) => getClient().send(new HeadObjectCommand({ Bucket: bucket(), Key: objectKey }));
const getObject = (objectKey) => getClient().send(new GetObjectCommand({ Bucket: bucket(), Key: objectKey }));
const deleteObject = (objectKey) => getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: objectKey }));
const copyObject = ({ sourceKey, destinationKey, contentType }) => getClient().send(new CopyObjectCommand({
  Bucket: bucket(),
  Key: destinationKey,
  CopySource: `${bucket()}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`,
  MetadataDirective: 'REPLACE',
  ContentType: contentType || 'application/octet-stream',
}));

module.exports = { createUploadUrl, putObject, createDownloadUrl, createViewUrl, headObject, getObject, deleteObject, copyObject };
