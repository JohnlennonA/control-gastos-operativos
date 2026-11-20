-- Ejecuta este parche en Supabase SQL Editor si tu base ya existe.
-- Agrega la columna empresa (UV Servicios / Union Data) a gastos_operativos.

alter table public.gastos_operativos
    add column if not exists empresa text;

create index if not exists gastos_operativos_empresa_idx
    on public.gastos_operativos (empresa);

