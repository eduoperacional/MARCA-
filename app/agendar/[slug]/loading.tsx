import { Skeleton } from "@/components/ui/skeleton"

export default function BookingLoading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-4 py-10" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-96 rounded-xl" />
    </main>
  )
}
