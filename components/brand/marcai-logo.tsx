import Image from "next/image"
import { cn } from "@/lib/utils"

export function MarcaiMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black ring-1 ring-primary/40 shadow-[0_0_24px_-6px_rgb(123_63_242/0.6)]",
        className
      )}
    >
      <Image
        src="/brand/marcai-icon.png"
        alt=""
        width={256}
        height={256}
        className="size-full object-cover"
        priority
      />
    </span>
  )
}

export function MarcaiWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-heading text-lg font-semibold tracking-[0.08em] text-foreground",
        className
      )}
    >
      MARCAÍ
    </span>
  )
}
