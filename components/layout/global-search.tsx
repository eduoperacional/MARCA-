"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Command,
} from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { NAV_SECTIONS } from "@/config/navigation"
import { QUICK_ACTIONS } from "@/config/quick-actions"

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="hidden w-full max-w-sm justify-start gap-2 text-muted-foreground md:flex"
      >
        <Search data-icon="inline-start" />
        <span className="flex-1 text-left font-normal">
          Buscar páginas e ações...
        </span>
        <Kbd>⌘K</Kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="md:hidden"
        aria-label="Abrir busca"
      >
        <Search />
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Busca global"
        description="Pesquise páginas e ações do MARCAÍ"
      >
        <Command>
          <CommandInput placeholder="O que você procura?" />
          <CommandList>
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
            <CommandGroup heading="Ações rápidas">
              {QUICK_ACTIONS.filter((action) => action.href).map((action) => (
                <CommandItem
                  key={action.id}
                  value={action.label}
                  onSelect={() => go(action.href!)}
                >
                  <action.icon />
                  {action.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {NAV_SECTIONS.map((section) => (
              <CommandGroup key={section.id} heading={section.label}>
                {section.items.map((item) => (
                  <CommandItem
                    key={item.href}
                    value={`${item.title} ${item.description}`}
                    onSelect={() => go(item.href)}
                  >
                    <item.icon />
                    {item.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
