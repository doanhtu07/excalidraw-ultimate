/** Reference text `help()` returns, grouped the same way as the commands. */
export const BRIDGE_HELP = `Excalidraw agent bridge (v1)

Read:
  getState()                      tabs, active file, dirty flags, readiness
  describe()                      compact element summary of the active drawing
  getScene()                      { elements, appState, files } as JSON

Write (all return { created, updated, deleted, warnings }):
  add(elements, { scroll? })      create elements, agent-friendly format
  apply({ create, update, delete })
  update(id, set)                 patch one element by id
  deleteElements(ids)
  clear()                         removes every element (explicit only)
  restore({ elements, appState?, files? })

Canvas:
  open(path)                      open a .excalidraw file by absolute path
  save()                          save the active drawing back to its path
  setViewport({ fit?, ids?, zoom?, animate? })

Element format: a shape takes "text" for a bound label, arrows take
"startElementId"/"endElementId", points may be [[x, y], ...]. Coordinates are
scene coordinates with y increasing downward. Element ids are stable; reuse
them for updates and never rebuild the scene to change one thing.`
