-- Bivališče: kraj (Excel "Kraj" v naslovu). users že ima address_street/house/postal/country.
alter table public.users add column if not exists address_city text;
