-- Prisilna sprememba gesla ob prvi prijavi z začetnim (generičnim) geslom.
-- Ko je zastavica true, aplikacija uporabnika po prijavi preusmeri na zaslon za
-- spremembo gesla; po uspešni spremembi jo počisti (dovoljuje obstoječa
-- »Lastni profil« UPDATE politika: auth.uid() = id).
alter table users
  add column if not exists must_change_password boolean not null default false;
