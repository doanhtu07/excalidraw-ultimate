import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [{ title: 'Excalidraw Client' }],
  }),
  component: Home,
})

function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-4xl font-bold">Excalidraw Client</h1>
    </main>
  )
}
