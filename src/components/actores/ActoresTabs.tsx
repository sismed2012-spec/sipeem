"use client";

import type { ReactNode } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { ActoresMunicipioData } from "@/actions/actores";
import TermometrosForm from "./TermometrosForm";
import EscenariosForm from "./EscenariosForm";
import ComiteForm from "./ComiteForm";
import PlanillaPanel from "./PlanillaPanel";
import AspirantesPanel from "./AspirantesPanel";
import AgendaPanel from "./AgendaPanel";
import IncidenciasPanel from "./IncidenciasPanel";
import CompromisosPanel from "./CompromisosPanel";
import CompetenciaForm from "./CompetenciaForm";
import ProyeccionPanel from "./ProyeccionPanel";
import type { ProyeccionMunicipio } from "@/actions/proyeccion";
import AsistenteChat from "./AsistenteChat";
import TermometrosDiagnostico from "./TermometrosDiagnostico";
import PulsoDigitalPanel from "./PulsoDigitalPanel";

type Props = {
  municipioId: number;
  actores: ActoresMunicipioData;
  proyeccion: ProyeccionMunicipio | null;
  children: ReactNode;
};

export default function ActoresTabs({ municipioId, actores, proyeccion, children }: Props) {
  return (
    <Tabs defaultValue="estrategia" className="space-y-6">
      <TabsList className="w-full h-auto flex-wrap gap-1 rounded-2xl p-1.5">
        <TabsTrigger value="estrategia">Estrategia</TabsTrigger>
        <TabsTrigger value="termometros">Termómetros</TabsTrigger>
        <TabsTrigger value="escenarios">Escenarios</TabsTrigger>
        <TabsTrigger value="comite">Comité</TabsTrigger>
        <TabsTrigger value="planilla">Planilla</TabsTrigger>
        <TabsTrigger value="aspirantes">Aspirantes</TabsTrigger>
        <TabsTrigger value="agenda">Agenda</TabsTrigger>
        <TabsTrigger value="incidencias">Incidencias</TabsTrigger>
        <TabsTrigger value="compromisos">Compromisos</TabsTrigger>
        <TabsTrigger value="competencia">Competencia</TabsTrigger>
        <TabsTrigger value="proyeccion">Proyección</TabsTrigger>
        <TabsTrigger value="asistente">Asistente IA</TabsTrigger>
        <TabsTrigger value="pulso">Pulso Digital</TabsTrigger>
      </TabsList>

      <TabsContent value="estrategia" className="space-y-8">
        {children}
      </TabsContent>

      <TabsContent value="termometros">
        <TermometrosForm municipioId={municipioId} initialData={actores.termometros} />
        <TermometrosDiagnostico municipioId={municipioId} termometros={actores.termometros} />
      </TabsContent>

      <TabsContent value="escenarios">
        <EscenariosForm municipioId={municipioId} initialData={actores.escenarios} />
      </TabsContent>

      <TabsContent value="comite">
        <ComiteForm municipioId={municipioId} initialData={actores.comite} />
      </TabsContent>

      <TabsContent value="planilla">
        <PlanillaPanel municipioId={municipioId} initialData={actores.planilla} />
      </TabsContent>

      <TabsContent value="aspirantes">
        <AspirantesPanel municipioId={municipioId} initialData={actores.aspirantes} />
      </TabsContent>

      <TabsContent value="agenda">
        <AgendaPanel municipioId={municipioId} initialEventos={actores.eventos} />
      </TabsContent>

      <TabsContent value="incidencias">
        <IncidenciasPanel municipioId={municipioId} initialIncidencias={actores.incidencias} />
      </TabsContent>

      <TabsContent value="compromisos">
        <CompromisosPanel municipioId={municipioId} initialCompromisos={actores.compromisos} />
      </TabsContent>

      <TabsContent value="competencia">
        <CompetenciaForm municipioId={municipioId} initialData={actores.competencia} />
      </TabsContent>

      <TabsContent value="proyeccion">
        <ProyeccionPanel proyeccion={proyeccion} />
      </TabsContent>

      <TabsContent value="asistente">
        <AsistenteChat municipioId={municipioId} />
      </TabsContent>

      <TabsContent value="pulso">
        <PulsoDigitalPanel municipioId={municipioId} initialPulso={actores.pulso} />
      </TabsContent>
    </Tabs>
  );
}
