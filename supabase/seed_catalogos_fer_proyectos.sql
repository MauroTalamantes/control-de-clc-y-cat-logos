-- Catalogos generados desde: C:/Users/Mauro/Downloads/fer proyectos.xlsx
-- Fecha: 2026-06-04
-- Registros fuente: 100
-- Proyectos unicos: 7
-- Objetos de gasto unicos: 39
--
-- Este script conserva los demas catalogos existentes y reemplaza solo:
--   catalogs.proyectos
--   catalogs.objetos

insert into public.clc_app_settings (id, catalogs, app_key)
values ('default', '{}'::jsonb, null)
on conflict (id) do nothing;

update public.clc_app_settings
set catalogs = jsonb_set(
  jsonb_set(
    coalesce(catalogs, '{}'::jsonb),
    '{proyectos}',
    $json$[
  {
    "id": "pr_301001",
    "clave": "301001",
    "descripcion": "GASTOS ADMINISTRATIVOS DE OBRAS Y SERVICIOS PÚBLICOS"
  },
  {
    "id": "pr_304003",
    "clave": "304003",
    "descripcion": "ALUMBRADO PÚBLICO"
  },
  {
    "id": "pr_304004",
    "clave": "304004",
    "descripcion": "LIMPIA, RECOLECCIÓN, TRASLADO, TRATAMIENTO Y DISPOSICION FINAL DE RESIDUOS"
  },
  {
    "id": "pr_304006",
    "clave": "304006",
    "descripcion": "PANTEONES"
  },
  {
    "id": "pr_304007",
    "clave": "304007",
    "descripcion": "RASTRO"
  },
  {
    "id": "pr_304009",
    "clave": "304009",
    "descripcion": "PARQUES Y JARDINES"
  },
  {
    "id": "pr_304010",
    "clave": "304010",
    "descripcion": "CONTROL CANINO Y FELINO"
  }
]$json$::jsonb,
    true
  ),
  '{objetos}',
  $json$[
  {
    "id": "o_2111",
    "clave": "2111",
    "nombre": "PAPELERÍA DE OFICINA"
  },
  {
    "id": "o_2121",
    "clave": "2121",
    "nombre": "MATERIALES Y ÚTILES DE IMPRESIÓN Y REPRODUCCIÓN."
  },
  {
    "id": "o_2151",
    "clave": "2151",
    "nombre": "MATERIAL IMPRESO E INFORMACIÓN DIGITAL"
  },
  {
    "id": "o_2161",
    "clave": "2161",
    "nombre": "MATERIAL DE LIMPIEZA DE OFICINA"
  },
  {
    "id": "o_2215",
    "clave": "2215",
    "nombre": "PRODUCTOS ALIMENTICIOS PARA EL PERSONAL DERIVADO DE ACTIVIDADES EXTRAORDINARIAS."
  },
  {
    "id": "o_2221",
    "clave": "2221",
    "nombre": "PRODUCTOS ALIMENTICIOS PARA ANIMALES."
  },
  {
    "id": "o_2431",
    "clave": "2431",
    "nombre": "CAL, YESO Y PRODUCTOS DE YESO"
  },
  {
    "id": "o_2461",
    "clave": "2461",
    "nombre": "MATERIAL ELÉCTRICO Y ELECTRÓNICO"
  },
  {
    "id": "o_2471",
    "clave": "2471",
    "nombre": "ARTÍCULOS METÁLICOS PARA LA CONSTRUCCIÓN"
  },
  {
    "id": "o_2491",
    "clave": "2491",
    "nombre": "OTROS MATERIALES Y ARTÍCULOS DE CONSTRUCCIÓN Y REPARACIÓN"
  },
  {
    "id": "o_2511",
    "clave": "2511",
    "nombre": "SUSTANCIAS QUIMICAS"
  },
  {
    "id": "o_2521",
    "clave": "2521",
    "nombre": "PLAGUICIDAS ABONOS Y FERTILIZANTES."
  },
  {
    "id": "o_2531",
    "clave": "2531",
    "nombre": "MEDICINAS Y PRODUCTOS FARMACÉUTICOS."
  },
  {
    "id": "o_2541",
    "clave": "2541",
    "nombre": "MATERIALES, ACCESORIOS Y SUMINISTROS MÉDICOS."
  },
  {
    "id": "o_2611",
    "clave": "2611",
    "nombre": "GASOLINA"
  },
  {
    "id": "o_2614",
    "clave": "2614",
    "nombre": "LUBRICANTES Y ADITIVOS"
  },
  {
    "id": "o_2711",
    "clave": "2711",
    "nombre": "VESTUARIO Y UNIFORMES"
  },
  {
    "id": "o_2721",
    "clave": "2721",
    "nombre": "PRENDAS DE SEGURIDAD Y PROTECCIÓN PERSONAL"
  },
  {
    "id": "o_2911",
    "clave": "2911",
    "nombre": "HERRAMIENTAS MENORES"
  },
  {
    "id": "o_2921",
    "clave": "2921",
    "nombre": "REFACCIONES Y ACCESORIOS MENORES DE EDIFICIOS"
  },
  {
    "id": "o_2941",
    "clave": "2941",
    "nombre": "REFACCIONES Y ACCESORIOS MENORES DE EQUIPO DE CÓMPUTO Y TECNOLOGÍAS DE LA INFORMACIÓN"
  },
  {
    "id": "o_2961",
    "clave": "2961",
    "nombre": "REFACCIONES Y ACCESORIOS MENORES DE EQUIPO DE TRANSPORTE"
  },
  {
    "id": "o_3121",
    "clave": "3121",
    "nombre": "GAS"
  },
  {
    "id": "o_3131",
    "clave": "3131",
    "nombre": "SERVICIO DE AGUA."
  },
  {
    "id": "o_3191",
    "clave": "3191",
    "nombre": "SERVICIOS INTEGRALES Y OTROS SERVICIOS"
  },
  {
    "id": "o_3221",
    "clave": "3221",
    "nombre": "ARRENDAMIENTO DE EDIFICIOS"
  },
  {
    "id": "o_3252",
    "clave": "3252",
    "nombre": "ARRENDAMIENTO DE VEHÍCULOS TERRESTRES Y AÉREOS, PARA SERVICIOS PÚBLICOS Y LA OPERACIÓN DE PROGRAMAS PÚBLICOS."
  },
  {
    "id": "o_3291",
    "clave": "3291",
    "nombre": "OTROS ARRENDAMIENTOS"
  },
  {
    "id": "o_3391",
    "clave": "3391",
    "nombre": "SERVICIOS PROFESIONALES, CIENTÍFICOS Y TÉCNICOS INTEGRALES"
  },
  {
    "id": "o_3551",
    "clave": "3551",
    "nombre": "MANTENIMIENTO Y CONSERVACIÓN DE VEHÍCULOS TERRESTRES, AÉREOS, MARÍTIMOS, LACUSTRES Y FLUVIALES."
  },
  {
    "id": "o_3581",
    "clave": "3581",
    "nombre": "SERVICIOS DE LAVANDERÍA, LIMPIEZA, HIGIENE Y FUMIGACIÓN."
  },
  {
    "id": "o_3821",
    "clave": "3821",
    "nombre": "GASTOS DE ORDEN SOCIAL Y CULTURAL"
  },
  {
    "id": "o_5151",
    "clave": "5151",
    "nombre": "BIENES INFORMÁTICOS."
  },
  {
    "id": "o_5191",
    "clave": "5191",
    "nombre": "OTROS MOBILIARIOS Y EQUIPOS DE ADMINISTRACIÓN"
  },
  {
    "id": "o_5231",
    "clave": "5231",
    "nombre": "CÁMARAS FOTOGRÁFICAS Y DE VIDEO"
  },
  {
    "id": "o_5411",
    "clave": "5411",
    "nombre": "VEHÍCULOS Y EQUIPO TERRESTRE"
  },
  {
    "id": "o_5421",
    "clave": "5421",
    "nombre": "CARROCERÍAS Y REMOLQUES"
  },
  {
    "id": "o_5671",
    "clave": "5671",
    "nombre": "HERRAMIENTAS"
  },
  {
    "id": "o_5781",
    "clave": "5781",
    "nombre": "ARBOLES Y PLANTAS"
  }
]$json$::jsonb,
  true
)
where id = 'default';

-- Verificacion rapida despues de ejecutar:
-- select
--   jsonb_array_length(catalogs->'proyectos') as proyectos,
--   jsonb_array_length(catalogs->'objetos') as objetos
-- from public.clc_app_settings
-- where id = 'default';
