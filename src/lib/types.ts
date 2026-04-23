export type Rol = "operador" | "admin" | "director";

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  municipios_asignados: number[];
}

export interface Municipio {
  id: number;
  nombre: string;
  geo_municipio_id: number | null;
  nombre_oficial_geojson: string | null;
  color: string;
  sec_inicio: number;
  secciones: number;
  regidores: number;
  distrito: string | null;
  region: string | null;
  estatus: "activo" | "inactivo";
  created_at?: string;
}

export interface Partido {
  id: number;
  nombre: string;
  siglas: string;
  color: string;
  estatus: "activo" | "inactivo";
  created_at?: string;
  updated_at?: string;
}

export interface Alcalde {
  id: number;
  municipio_id: number;
  nombre: string;
  partido: string;
  foto_url: string | null;
}

export interface DatosElectorales {
  id: number;
  municipio_id: number;
  nom: number;
  padron: number;
  votos_totales: number;
  votos: number;
  dif_votos: number;
  dif_pct: number;
  participacion: number;
  sec_ganadas: number;
}

// Historial Electoral Normalizado
export interface HistorialElectoral {
  id?: number;
  municipio_id: number;
  anio: number;
  partido_ganador_id: number;
  votos_ganador: number;
  porcentaje_ganador: number;
  fuente?: string | null;
  notas?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface HistorialResultado {
  id?: number;
  historial_id: number;
  partido_id: number;
  votos: number;
  porcentaje: number;
  posicion: number;
  created_at?: string;
}

// Interfaz para vistas y listados con Joins
export interface HistorialElectoralDetalle extends HistorialElectoral {
  municipio?: {
    nombre: string;
  };
  partido_ganador?: Partido;
  resultados?: (HistorialResultado & { partido: Partido })[];
}

export interface Termometros {
  id: number;
  municipio_id: number;
  term1: number;
  term2: number;
  term3: number;
  term4: number;
  term5: number;
  diagnostico_ia?: string | null;
  diagnostico_at?: string | null;
}

export interface Escenarios {
  id: number;
  municipio_id: number;
  e1_comp: string;
  e1_rec: string;
  e2_gen: string;
  e2_atr: string;
  e3_gob: string;
  e3_dem: string;
  e4_niv: string;
  e4_foco: string;
}

export interface ComiteMunicipal {
  id: number;
  municipio_id: number;
  presidente: string;
  secretario: string;
  fachada_url: string | null;
  link_maps: string | null;
  inaugurado: boolean;
}

export interface Planilla {
  id: number;
  municipio_id: number;
  cargo: string;
  nombre: string;
  partido: string;
  foto_url: string | null;
}

export interface Aspirante {
  id: number;
  municipio_id: number;
  nombre: string;
  cargo_aspirado: string;
  partido: string;
  fecha_nacimiento: string | null;
  telefono: string | null;
  email: string | null;
  foto_url: string | null;
  notas: string | null;
  perfil_ia?: string | null;
  perfil_at?: string | null;
}

export interface MunicipioDashboard {
  municipio: Municipio;
  alcalde: Alcalde | null;
  datos: DatosElectorales | null;
  historial: HistorialElectoralDetalle[];
  termometros: Termometros | null;
  escenarios: Escenarios | null;
  comite: ComiteMunicipal | null;
}

export interface Configuracion {
  id: number;
  clave: string;
  valor: string;
  categoria: string;
  descripcion: string | null;
  created_at?: string;
  updated_at?: string;
}

// --- FASE 7: ESTRATEGIA MUNICIPAL ---

export type PrioridadEstrategica = 'Baja' | 'Media' | 'Alta' | 'Crítica';
export type RiesgoPolitico = 'Bajo' | 'Medio' | 'Alto' | 'Extremo';
export type OportunidadPolitica = 'Baja' | 'Media' | 'Alta';
export type EstatusEstrategia = 'Planeación' | 'En Proceso' | 'Ejecutado' | 'Monitoreo';

export interface EstrategiaMunicipal {
  id: number;
  municipio_id: number;
  prioridad: PrioridadEstrategica;
  riesgo: RiesgoPolitico;
  oportunidad: OportunidadPolitica;
  notas_ejecutivas: string | null;
  notas_operativas: string | null;
  responsable: string | null;
  estatus: EstatusEstrategia;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface StrategicDashboardDTO {
  stats: {
    total: number;
    pending: number;
    byPriority: Record<string, number>;
    byRisk: Record<string, number>;
  };
  municipios: (Municipio & { estrategia: EstrategiaMunicipal | null })[];
}

export interface EventoCampana {
  id: number;
  municipio_id: number;
  titulo: string;
  tipo: "mitin" | "recorrido" | "reunion" | "visita" | "otro";
  fecha: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  ubicacion: string | null;
  aforo_estimado: number | null;
  aforo_real: number | null;
  responsable: string | null;
  notas: string | null;
  created_at: string;
}

export interface Incidencia {
  id: number;
  municipio_id: number;
  tipo: "violencia" | "acarreo" | "compra_voto" | "propaganda_ilegal" | "otro";
  descripcion: string;
  severidad: "baja" | "media" | "alta" | "critica";
  estatus: "abierta" | "en_seguimiento" | "resuelta";
  fecha: string;
  reportado_por: string | null;
  notas: string | null;
  created_at: string;
}

export interface SeccionElectoral {
  id: number;
  municipio_id: number;
  numero: number;
  tipo: "urbana" | "rural" | "mixta" | null;
  lista_nominal: number | null;
}

export interface Promotor {
  id: number;
  municipio_id: number;
  nombre: string;
  telefono: string | null;
  secciones_asign: number[];
  meta_compromisos: number;
  activo: boolean;
  created_at: string;
}

export interface CompromisoSeccion {
  id: number;
  municipio_id: number;
  seccion_id: number | null;
  promotor_id: number | null;
  compromisos: number;
  meta: number;
  fecha: string;
}

export interface CompetenciaMunicipal {
  id: number;
  municipio_id: number;
  candidato_nombre: string | null;
  partido: string | null;
  fortaleza: "debil" | "media" | "fuerte" | "muy_fuerte" | null;
  recursos_estimados: "bajos" | "medios" | "altos" | "muy_altos" | null;
  ventajas: string | null;
  debilidades: string | null;
  movimientos_recientes: string | null;
  riesgo_electoral: "bajo" | "medio" | "alto" | "critico" | null;
  updated_at: string | null;
}

export interface CompromisoCampana {
  id: number;
  municipio_id: number;
  titulo: string;
  descripcion: string | null;
  tema: "obra" | "servicio" | "gestion" | "social" | "seguridad" | "otro";
  estatus: "pendiente" | "en_proceso" | "cumplido" | "cancelado";
  fecha_compromiso: string | null;
  fecha_cumplimiento: string | null;
  responsable: string | null;
  created_at: string;
}
