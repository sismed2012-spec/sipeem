# SIPEEM — Roadmap de Expansión

> Fuente de verdad de implementación. Actualizar estado al iniciar y completar cada feature.

**Última actualización:** 2026-04-22 — IMPLEMENTACIÓN COMPLETA  
**Stack:** Next.js 16.2.3 · React 19.2.4 · Supabase · Tailwind CSS 4 · @base-ui/react

---

## Estado global

| # | Módulo | Fase | Plan | Estado |
|---|--------|------|------|--------|
| B1 | Dashboard ejecutivo unificado | 1 | [plan](2026-04-21-fase1-b1-dashboard-ejecutivo.md) | ✅ Completado |
| D2 | Audit log | 1 | [plan](2026-04-21-fase1-d2-audit-log.md) | ✅ Completado |
| D1 | Exportación PDF / Excel | 1 | [plan](2026-04-21-fase1-d1-exportacion.md) | ✅ Completado |
| A2 | Agenda política y eventos | 2 | [plan](2026-04-21-fase2-a2-agenda.md) | ✅ Completado |
| A4 | Registro de incidencias | 2 | [plan](2026-04-21-fase2-a4-incidencias.md) | ✅ Completado |
| A3 | Compromisos de campaña | 2 | [plan](2026-04-21-fase2-a3-compromisos.md) | ✅ Completado |
| A1 | Estructura territorial | 3 | [plan](2026-04-21-fase3-a1-estructura-territorial.md) | ✅ Completado |
| B2 | Análisis de competencia | 3 | [plan](2026-04-21-fase3-b2-competencia.md) | ✅ Completado |
| B3 | Drill-down a secciones electorales | 4 | [plan](2026-04-21-fase4-b3-secciones.md) | ✅ Completado |
| B4 | Proyección electoral simple | 4 | [plan](2026-04-21-fase4-b4-proyeccion.md) | ✅ Completado |
| AI-0 | Setup AI SDK (prerequisito Fase 5+) | 5 | [plan](2026-04-21-fase5-ai-setup.md) | ✅ Completado |
| C1 | Asistente de estrategia (AI) | 5 | [plan](2026-04-21-fase5-c1-asistente.md) | ✅ Completado |
| C2 | Generador de briefings (AI) | 5 | [plan](2026-04-21-fase5-c2-briefings.md) | ✅ Completado |
| C3 | Interpretación termómetros (AI) | 5 | [plan](2026-04-21-fase5-c3-termometros-ai.md) | ✅ Completado |
| C4 | Monitoreo redes sociales (AI) | 6 | [plan](2026-04-21-fase6-c4-redes.md) | ✅ Completado |
| C6 | Perfilado aspirantes (AI) | 6 | [plan](2026-04-21-fase6-c6-perfilado.md) | ✅ Completado |
| C7 | Detector anomalías electorales (AI) | 6 | [plan](2026-04-21-fase6-c7-anomalias.md) | ✅ Completado |
| C5 | Proyección electoral con ML | 6 | [plan](2026-04-21-fase6-c5-ml.md) | ✅ Completado |
| D3 | PWA móvil para operadores | 7 | [plan](2026-04-21-fase7-d3-pwa.md) | ✅ Completado |
| D4 | API pública / webhooks | 7 | [plan](2026-04-21-fase7-d4-api.md) | ✅ Completado |

**Estados:** ⬜ Pendiente · 🔵 En progreso · ✅ Completado

---

## Dependencias críticas

```
Fase 1 (B1, D2, D1)
  └─ D2 (audit log) debe completarse antes de Fase 2
       para que cada módulo nuevo loguee desde el inicio

Fase 2 (A2, A4, A3)
  └─ Independientes entre sí, ejecutar en cualquier orden

Fase 3 (A1, B2)
  └─ A1 debe ir antes que C4 (redes sociales necesita estructura territorial)

Fase 4 (B3, B4)
  └─ B3 requiere GeoJSON de secciones del Edomex (validar disponibilidad)
  └─ B4 se construye sobre datos de A1 (cobertura) + termómetros existentes

Fase 5 (AI Setup → C1, C2, C3)
  └─ AI-0 (setup) es prerequisito de todos los módulos Fase 5+

Fase 6 (C4, C6, C7, C5)
  └─ Todos requieren AI Setup de Fase 5
  └─ C5 (ML) es el más complejo — puede ejecutarse en paralelo con C4/C6/C7

Fase 7 (D3, D4)
  └─ D3 requiere que Fase 2 esté completa (operadores necesitan captura de campo)
  └─ D4 independiente, puede ejecutarse antes si hay demanda externa
```

---

## Nuevas tablas requeridas por fase

| Fase | Tabla | Descripción |
|------|-------|-------------|
| 1 | `audit_logs` | Log de todas las acciones administrativas |
| 2 | `eventos_campana` | Agenda política por municipio |
| 2 | `incidencias` | Incidentes político-electorales |
| 2 | `compromisos_campana` | Promesas de campaña con seguimiento |
| 3 | `secciones` | Catálogo de secciones electorales |
| 3 | `promotores` | Activistas asignados por municipio |
| 3 | `compromisos_seccion` | Avance de compromisos de voto por sección |
| 3 | `competencia_municipal` | Datos del adversario por municipio |
| 6 | `pulso_digital` | Resúmenes de monitoreo de redes |
| 7 | `api_keys` | Llaves para API pública |

---

## Prerequisitos para Fase 5+

Antes de iniciar cualquier módulo de Fase 5, ejecutar:

```bash
npm install ai
```

Agregar a `.env.local` UNA de las dos opciones:
```
# Opción A (recomendada) — OIDC via Vercel AI Gateway
# Ejecutar: vercel env pull .env.local

# Opción B — API key directa
AI_GATEWAY_API_KEY=...
```

NO instalar `@ai-sdk/anthropic`. Usar el gateway con slugs en formato `"anthropic/claude-sonnet-4.6"` (puntos, no guiones).

---

## Convención de rutas nuevas

```
/admin/situacion                    → B1 Dashboard ejecutivo
/admin/auditoria                    → D2 Audit log viewer
/admin/estrategia-municipal/[id]    → + tabs: Agenda, Incidencias, Compromisos (Fase 2)
/admin/estructura/[municipioId]     → A1 Estructura territorial
/admin/situacion                    → + columna de proyección (Fase 4, B4)
/admin/api-keys                     → D4 Gestión de API keys
/campo                              → D3 PWA campo para operadores
/api/v1/municipios                  → D4 API pública (requiere X-API-Key header)
/api/v1/historial                   → D4 API pública
```
