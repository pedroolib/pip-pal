import * as React from 'react'
import { cn } from '@renderer/lib/utils'
import { Switch as SwitchPrimitive } from 'radix-ui'

function Switch({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: 'sm' | 'default'
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-transparent bg-switch-off p-0.5 transition-colors outline-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:bg-primary',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-6 rounded-full bg-surface shadow-thumb data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground ring-0 transition-transform duration-150 data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
