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
