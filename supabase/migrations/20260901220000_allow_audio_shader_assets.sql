-- Audio document inputs persist in shader-assets the same way image and
-- video fills do. Keep the existing image/video allow-list and add common
-- audio types browsers emit for mp3/wav/ogg/m4a/flac uploads.
update storage.buckets
set allowed_mime_types = array[
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'audio/x-m4a',
  'audio/m4a'
]
where id = 'shader-assets';
