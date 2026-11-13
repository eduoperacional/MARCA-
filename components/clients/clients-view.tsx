"use client"

import { useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Search, UserPlus, Users } from "lucide-react"

import { ClientDialog } from "@/components/clients/client-dialog"
import { PageHeader } from "@/components/layout/page-header"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useUrlParams } from "@/hooks/use-url-params"
import { formatCurrency, getInitials } from "@/lib/format"
import type { ClientItem, ClientSegment } from "@/lib/queries/clients"
import { cn } from "@/lib/utils"

const INACTIVE_DAYS = 45

function shortDate(value: string | null) {
  if (!value) return "—"
  return format(new Date(value), "dd/MM/yyyy", { locale: ptBR })
}

export function ClientsView({
  clients,
  segment,
  query,
  openCreate,
}: {
  clients: ClientItem[]
  segment: ClientSegment
  query: string
  openCreate: boolean
}) {
  const [createOpen, setCreateOpen] = useState(openCreate)
  const [search, setSearch] = useState(query)
  const { pending, setParams } = useUrlParams()

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Clientes"
        description="Cadastro, histórico e relacionamento com seus clientes."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus data-icon="inline-start" />
            Novo cliente
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={segment} onValueChange={(v) => setParams({ segment: v === "all" ? null : String(v) })}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="new">Novos</TabsTrigger>
            <TabsTrigger value="recurring">Recorrentes</TabsTrigger>
            <TabsTrigger value="inactive">Sem retorno</TabsTrigger>
          </TabsList>
        </Tabs>
        <form
          role="search"
          className="relative w-full md:w-80"
          onSubmit={(e) => {
            e.preventDefault()
            setParams({ q: search.trim() || null })
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Buscar por nome ou telefone"
            placeholder="Buscar por nome ou telefone"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => search.trim() !== query && setParams({ q: search.trim() || null })}
          />
        </form>
      </div>

      {segment === "inactive" && (
        <p className="text-sm text-muted-foreground">
          Clientes sem atendimento concluído há mais de {INACTIVE_DAYS} dias e sem horário futuro marcado. Uma boa lista para
          convidar de volta.
        </p>
      )}

      <Card className={cn("py-0 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        <CardContent className="px-0">
          {clients.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users />
                </EmptyMedia>
                <EmptyTitle>Nenhum cliente encontrado</EmptyTitle>
                <EmptyDescription>Ajuste a busca ou cadastre um novo cliente.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Telefone</TableHead>
                  <TableHead className="text-right">Visitas</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Total gasto</TableHead>
                  <TableHead className="hidden lg:table-cell">Última visita</TableHead>
                  <TableHead className="hidden pr-4 lg:table-cell">Próximo horário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.id} className="relative">
                    <TableCell className="pl-4">
                      <Link href={`/painel/clientes/${c.id}`} className="flex items-center gap-3 outline-none after:absolute after:inset-0 focus-visible:underline">
                        <Avatar className="size-8">
                          <AvatarFallback className="bg-muted text-xs">{getInitials(c.name)}</AvatarFallback>
                        </Avatar>
                        <span className="flex flex-col">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground md:hidden">{c.phone}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{c.phone}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.visits}
                      {c.visits >= 2 && (
                        <Badge variant="secondary" className="ml-2 hidden text-[10px] xl:inline-flex">
                          Recorrente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCurrency(c.totalSpent)}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="flex flex-col">
                        <span>{shortDate(c.lastVisit)}</span>
                        {c.daysSinceLastVisit !== null && (
                          <span className={cn("text-xs text-muted-foreground", c.daysSinceLastVisit > INACTIVE_DAYS && "text-warning")}>
                            há {c.daysSinceLastVisit} dias
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="hidden pr-4 lg:table-cell">
                      {c.nextAppointment ? format(new Date(c.nextAppointment), "dd/MM 'às' HH:mm", { locale: ptBR }) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ClientDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open && openCreate) setParams({ novo: null }, { replace: true })
        }}
      />
    </div>
  )
}
