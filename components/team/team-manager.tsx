"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createInvitation, revokeInvitation, updateMember } from "@/app/actions/team"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  DEFAULT_PERMISSIONS,
  GRANTABLE_PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type MemberRole,
  type Permission,
} from "@/lib/permissions"

type AssignableRole = Exclude<MemberRole, "owner">
const ASSIGNABLE_ROLES: AssignableRole[] = ["manager", "professional", "receptionist"]

interface Member {
  id: string
  role: MemberRole
  permissions: string[]
  professionalId: string | null
  active: boolean
  name: string
  email: string
}

interface Invite {
  id: string
  email: string
  role: MemberRole
  expiresAt: string
}

interface Pro {
  id: string
  name: string
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function TeamManager({
  currentMemberId,
  members,
  invitations,
  professionals,
}: {
  currentMemberId: string
  members: Member[]
  invitations: Invite[]
  professionals: Pro[]
}) {
  return (
    <div className="flex flex-col gap-6">
      <InviteForm professionals={professionals} />
      <Card>
        <CardHeader>
          <CardTitle>Membros</CardTitle>
          <CardDescription>Pessoas com acesso ao painel deste estabelecimento.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {members.map((member) => (
            <MemberRow key={member.id} member={member} professionals={professionals} isSelf={member.id === currentMemberId} />
          ))}
        </CardContent>
      </Card>
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Convites pendentes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {invitations.map((invite) => (
              <PendingInvite key={invite.id} invite={invite} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function PermissionPicker({
  role,
  value,
  onChange,
}: {
  role: AssignableRole
  value: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Permissões</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {GRANTABLE_PERMISSIONS[role].map((permission) => (
          <label key={permission} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={value.includes(permission)}
              onCheckedChange={(checked) =>
                onChange(checked ? [...value, permission] : value.filter((p) => p !== permission))
              }
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{PERMISSION_LABELS[permission].label}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{PERMISSION_LABELS[permission].description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function RoleFields({
  idPrefix,
  role,
  setRole,
  permissions,
  setPermissions,
  professionalId,
  setProfessionalId,
  professionals,
}: {
  idPrefix: string
  role: AssignableRole
  setRole: (role: AssignableRole) => void
  permissions: string[]
  setPermissions: (p: string[]) => void
  professionalId: string | null
  setProfessionalId: (id: string | null) => void
  professionals: Pro[]
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-role`}>Função</Label>
          <select
            id={`${idPrefix}-role`}
            className={selectClass}
            value={role}
            onChange={(e) => {
              const next = e.target.value as AssignableRole
              setRole(next)
              setPermissions(DEFAULT_PERMISSIONS[next] as Permission[])
            }}
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r} className="bg-popover">
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-pro`}>
            Profissional vinculado{role === "professional" ? "" : " (opcional)"}
          </Label>
          <select
            id={`${idPrefix}-pro`}
            className={selectClass}
            value={professionalId ?? ""}
            onChange={(e) => setProfessionalId(e.target.value || null)}
          >
            <option value="" className="bg-popover">Nenhum</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id} className="bg-popover">
                {p.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Define a agenda individual que esta pessoa acessa.</p>
        </div>
      </div>
      <PermissionPicker role={role} value={permissions} onChange={setPermissions} />
    </>
  )
}

function InviteForm({ professionals }: { professionals: Pro[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<AssignableRole>("receptionist")
  const [permissions, setPermissions] = useState<string[]>(DEFAULT_PERMISSIONS.receptionist)
  const [professionalId, setProfessionalId] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await createInvitation({ email, role, permissions, professionalId })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.data.emailed) {
        toast.success("Convite enviado por e-mail.")
        setLink(null)
      } else {
        setLink(result.data.url)
        toast.success("Convite criado. Copie o link e envie para a pessoa.")
      }
      setEmail("")
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Convidar pessoa</CardTitle>
        <CardDescription>O convite expira em 7 dias e só pode ser aceito pelo e-mail informado.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">E-mail</Label>
            <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <RoleFields
            idPrefix="invite"
            role={role}
            setRole={setRole}
            permissions={permissions}
            setPermissions={setPermissions}
            professionalId={professionalId}
            setProfessionalId={setProfessionalId}
            professionals={professionals}
          />
          {link && (
            <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3">
              <p className="text-sm">O envio de e-mails não está configurado. Envie este link manualmente:</p>
              <div className="flex gap-2">
                <Input readOnly value={link} aria-label="Link do convite" onFocus={(e) => e.currentTarget.select()} />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link copiado."))}
                >
                  Copiar
                </Button>
              </div>
            </div>
          )}
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Enviando..." : "Enviar convite"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function MemberRow({ member, professionals, isSelf }: { member: Member; professionals: Pro[]; isSelf: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [role, setRole] = useState<AssignableRole>(member.role === "owner" ? "manager" : member.role)
  const [permissions, setPermissions] = useState(member.permissions)
  const [professionalId, setProfessionalId] = useState(member.professionalId)
  const [active, setActive] = useState(member.active)
  const locked = member.role === "owner" || isSelf

  const save = () =>
    startTransition(async () => {
      const result = await updateMember({ memberId: member.id, role, permissions, professionalId, active })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Acesso atualizado.")
      setEditing(false)
      router.refresh()
    })

  return (
    <div className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">
            {member.name}
            {isSelf && <span className="text-muted-foreground"> (você)</span>}
          </span>
          <span className="truncate text-sm text-muted-foreground">{member.email}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={member.active ? "secondary" : "outline"}>{ROLE_LABELS[member.role]}</Badge>
          {!member.active && <Badge variant="outline">Inativo</Badge>}
          {!locked && (
            <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              {editing ? "Fechar" : "Editar"}
            </Button>
          )}
        </div>
      </div>
      {editing && !locked && (
        <div className="flex flex-col gap-5 rounded-xl border bg-muted/30 p-4">
          <RoleFields
            idPrefix={`member-${member.id}`}
            role={role}
            setRole={setRole}
            permissions={permissions}
            setPermissions={setPermissions}
            professionalId={professionalId}
            setProfessionalId={setProfessionalId}
            professionals={professionals}
          />
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={active} onCheckedChange={setActive} />
            Acesso ativo
          </label>
          <Button onClick={save} disabled={pending} className="self-start">
            {pending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      )}
    </div>
  )
}

function PendingInvite({ invite }: { invite: Invite }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{invite.email}</span>
        <span className="text-xs text-muted-foreground">
          {ROLE_LABELS[invite.role]} · expira em {new Date(invite.expiresAt).toLocaleDateString("pt-BR")}
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await revokeInvitation(invite.id)
            if (!result.ok) toast.error(result.error)
            else {
              toast.success("Convite revogado.")
              router.refresh()
            }
          })
        }
      >
        Revogar
      </Button>
    </div>
  )
}
