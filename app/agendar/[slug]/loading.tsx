import { Skeleton } from "@/components/ui/skeleton"

export default function BookingLoading() {
  return (
    <div className="min-h-dvh bg-background" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-36 rounded-none sm:h-52 lg:h-60" />
      <div className="mx-auto -mt-14 flex max-w-6xl flex-col gap-4 px-4 sm:-mt-16 sm:flex-row sm:items-end sm:gap-6 sm:px-6">
        <Skeleton className="size-24 rounded-2xl ring-4 ring-background sm:size-28" />
        <div className="flex flex-col gap-2 pb-1">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
      </div>
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="flex flex-col gap-8">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-7 w-56" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        </div>
        <Skeleton className="hidden h-96 rounded-3xl lg:block" />
      </main>
    </div>
  )
}
