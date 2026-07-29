-- ─────────────────────────────────────────────────────────────────────────────
-- Rob OS — storage for original artefacts
--
-- Brief §7 step 1: store the original immediately. The extracted text on
-- `source.body` is what we chunk and cite, but the original is the ground truth —
-- if a citation ever looks wrong, the only way to settle it is to open the file
-- the claim came from.
--
-- Private bucket with no policies, matching the table posture: `anon` and
-- `authenticated` get nothing, and server code reaches it with the service role.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sources',
  'sources',
  false,
  -- 25 MB. Large enough for a scanned deck, small enough that a mis-drop fails
  -- fast rather than filling the disk.
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/markdown',
    'text/csv',
    'message/rfc822',
    'application/json',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/tiff'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies are created. With RLS on `storage.objects` (Supabase enables
-- it by default) and no policy for this bucket, only the service role can read or
-- write it — the same rule as every table in `public`.

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'sources') then
    raise exception 'the sources bucket was not created';
  end if;
end;
$$;
