-- Materials can be a link (Google Drive, YouTube…) instead of an uploaded file, for files over the 50 MB cap.
alter table public.materials
  add column link_url text,
  alter column file_path drop not null,
  alter column file_name drop not null;
alter table public.materials add constraint materials_file_or_link check (
  (file_path is not null and link_url is null) or (file_path is null and coalesce(link_url ~ '^https://\S+$', false))
);
