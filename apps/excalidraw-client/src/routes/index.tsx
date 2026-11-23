import { createFileRoute } from '@tanstack/react-router'
import styles from '@/styles/home.module.css'
import { ExcalidrawEditor } from '@/features/workspace/excalidraw-editor/excalidraw-editor'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [{ title: 'Excalidraw Client' }],
  }),
  component: Home,
})

function Home() {
  return (
    <main className={styles.root}>
      <ExcalidrawEditor />
    </main>
  )
}
