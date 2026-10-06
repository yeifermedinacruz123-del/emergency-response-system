/**
 * Tipos de los datos que devuelve la API del ERS.
 * Son los mismos campos que ya usa el panel clasico (vistas v_emergencies_full,
 * v_responders_full y v_dashboard_counters de PostgreSQL).
 */

export type RoleCode = 'CIUDADANO' | 'PERSONAL' | 'OPERADOR' | 'ADMINISTRADOR';
export type StatusCode = 'PENDIENTE' | 'EN_PROCESO' | 'RESUELTO' | 'CANCELADO';
export type PriorityCode = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';

/** Envoltorio comun de todas las respuestas: { success, message, data, meta? } */
export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: PageMeta;
  errors?: { field: string; message: string }[];
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

export interface User {
  id: number;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  role_code: RoleCode;
  role_name: string;
}

export interface LoginResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Emergency {
  id: number;
  code: string;
  title: string;
  description?: string | null;
  is_sos: boolean;
  reported_at: string;
  resolved_at?: string | null;
  type_code: string;
  type_name: string;
  type_icon: string;
  type_color: string;
  status_code: StatusCode;
  status_name: string;
  status_color: string;
  status_is_final?: boolean;
  priority_code: PriorityCode;
  priority_name: string;
  priority_color: string;
  priority_level: number;
  latitude: number;
  longitude: number;
  address: string | null;
  reference?: string | null;
  zone_name: string | null;
  accuracy_m?: number | null;
  reporter_id?: number;
  reporter_name?: string;
  reporter_phone?: string;
  assignment_count: number;
  photo_count?: number;
}

export interface Assignment {
  id: number;
  responder_id: number;
  unit_code: string;
  unit_name: string;
  responder_type: string;
  responder_name: string;
  status: string;
  assigned_at: string;
}

export interface HistoryItem {
  id: number;
  action: string;
  description: string | null;
  status_name: string | null;
  status_color: string | null;
  user_name: string | null;
  user_role: RoleCode | null;
  created_at: string;
}

/** file_path ya viene firmado por el servidor (/uploads/...?exp=&sig=). */
export interface Photo {
  id: number;
  file_path: string;
  mime_type: string;
  uploaded_by_name: string;
}

export interface EmergencyDetail extends Emergency {
  description: string | null;
  status_is_final: boolean;
  reporter_name: string;
  reporter_phone: string;
  photos: Photo[];
  history: HistoryItem[];
  assignments: Assignment[];
}

export interface Responder {
  id: number;
  unit_code: string;
  unit_name: string;
  responder_type: string;
  institution: string;
  status: 'DISPONIBLE' | 'OCUPADO' | 'FUERA_DE_SERVICIO' | string;
  full_name: string;
  current_latitude: number | null;
  current_longitude: number | null;
  active_assignments: number;
}

export interface ChatMessage {
  id: number;
  emergency_id: number;
  sender_id: number;
  sender_name: string;
  sender_role_code: RoleCode;
  message: string;
  created_at: string;
}

export interface DashboardCounters {
  pendientes: number;
  en_proceso: number;
  resueltas: number;
  canceladas: number;
  activas: number;
  sos_activas: number;
  sos_total: number;
  hoy: number;
  total: number;
  personal_disponible: number;
  personal_ocupado: number;
  personal_fuera: number;
  personal_total: number;
}

export interface MapData {
  emergencies: Emergency[];
  responders: Responder[];
  center: { lat: number; lng: number };
  zoom: number;
}

/** Marcador generico que entiende el componente MapView. */
export interface MapMarker {
  id: number;
  kind: 'emergency' | 'unit';
  lat: number;
  lng: number;
  color: string;
  title: string;
  subtitle: string;
  sos?: boolean;
}
