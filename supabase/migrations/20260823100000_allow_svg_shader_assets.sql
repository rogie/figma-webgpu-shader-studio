-- SVG fills and vector samples are valid shader inputs. The GPU rasterizes
-- them locally; persist the original file in shader-assets.
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
  'video/x-m4v'
]
where id = 'shader-assets';
