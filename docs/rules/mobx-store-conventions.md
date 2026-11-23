# MobX Store Conventions

## Immutability

All store updates must be **truly immutable from leaf to parent**. When you change a value, every ancestor up to the root observable must receive a new reference so MobX tracks the change correctly.

### Rules

1. **Primitives** — reassign directly. `this.name = 'new'` is fine (primitive reassignment is already immutable).

2. **Objects** — spread at the leaf **and** reassign every parent:

   ```typescript
   // ❌ Wrong — mutates in place, parent ref unchanged
   this.user.profile.name = 'new'

   // ✅ Correct — new leaf, new parents
   this.user = { ...this.user, profile: { ...this.user.profile, name: 'new' } }
   ```

3. **`Map` / `Set`** — create a **new** `Map`/`Set` and **reassign the parent**:

   ```typescript
   // ❌ Wrong — .set() mutates in place, parent ref unchanged
   this.items.set(id, updatedItem)

   // ✅ Correct — new Map, new parent
   this.items = new Map(this.items).set(id, updatedItem)
   ```

4. **Arrays** — always produce a new array reference:

   ```typescript
   // ❌ Wrong — splice mutates in place
   this.list.splice(index, 1)

   // ✅ Correct
   this.list = this.list.filter((_, i) => i !== index)
   ```

### Why leaf-to-parent

This is a **consistency practice**, not a MobX technical requirement — MobX can track deep mutations through its observability system. The reason we enforce immutability is to align with **React Compiler 19**, which assumes immutable data and optimizes accordingly. In-place mutations can confuse the compiler's memoization and scheduling. Immutable updates keep our store writes predictable and compatible with React's future direction.

### Consumer side

Because writes are immutable, consumers read values directly — no bridge helpers or shallow-copies needed:

```typescript
const { isOpen } = launcher
// or
const message = messageMap.get(messageId)
```

## Reading State: When to Destructure vs `useMobxSelector`

### Simple values / whole-object reads → destructure directly

For primitives or when reading a large object as a whole, destructure inside the observer component:

```typescript
const MyComponent = observer(() => {
  const { isOpen, title } = launcher
  return <Text>{title}: {isOpen ? 'Open' : 'Closed'}</Text>
})
```

This is fine because the component depends on the parent reference itself — when it changes, the component should re-render.

### Complex nested queries / granular reactivity → use `useMobxSelector`

For `Map`/`Set` lookups or nested object access where you only need **one specific item**, use `useMobxSelector` to avoid unnecessary re-renders:

```typescript
const GalleryThumbnailItem = observer(({ pixelArt }) => {
  const { progressStore } = useStore()

  const cachedFilledItem = useMobxSelector(
    useCallback(
      () => progressStore.cachedFilled.get(pixelArt._id),
      [],
    ),
  )

  return <PixelArtThumbnail filled={cachedFilledItem?.filled} />
})
```

### Why this matters

Immutability requires creating a new parent reference on every update (e.g. `new Map(this.items).set(id, item)`). If you destructure the parent and then read a child, **every consumer of that parent re-renders** when any sibling changes — even if their specific item is unchanged.

`useMobxSelector` tracks only the **specific value** returned by the selector. When the parent Map changes but the item for this component's `pixelArt._id` is the same reference, the component skips the re-render.

| Scenario                       | Approach              | Reason                                        |
| ------------------------------ | --------------------- | --------------------------------------------- |
| Primitive or whole-object read | `const { x } = store` | Component depends on the parent reference     |
| `Map.get(id)` in a list item   | `useMobxSelector`     | Only re-render when **this** item changes     |
| Nested object drill-down       | `useMobxSelector`     | Only re-render when the specific leaf changes |

### Contract

`useMobxSelector` requires a **stable selector** (wrap in `useCallback`) that **shallow-copies** the value it returns. An inline selector changes identity every render and tears down/recreates the reaction each commit.

## makeAutoObservable

Use `makeAutoObservable` over `makeObservable` — it infers all members by default, so new properties/methods don't need explicit annotations.

```typescript
class LauncherStore {
  constructor() {
    makeAutoObservable(this)
  }
}
```

**Inference rules:**

| Member type         | Inferred as  |
| ------------------- | ------------ |
| Own properties      | `observable` |
| Getters             | `computed`   |
| Setters             | `action`     |
| Functions           | `autoAction` |
| Generator functions | `flow`       |

Use `overrides` to exclude members or override defaults:

```typescript
makeAutoObservable(this, {
  id: false, // exclude from processing (e.g. read-only identifiers)
  fetchData: flow, // explicit override if generator detection fails
})
```

**Limitation:** Cannot be used on classes that extend another class or have `super`. Use `makeObservable` for those.

### Generator functions and `flow`

`makeAutoObservable` auto-detects generator functions as `flow`. However, some transpiler configurations may not detect them correctly. To be safe, explicitly annotate generator functions with `@flow`:

```typescript
class Store {
  constructor() {
    makeAutoObservable(this)
  }

  @flow
  *fetchData() {
    const response = yield fetch('/api/data')
    this.data = yield response.json()
  }
}
```

Alternatively, use the overrides map if decorators are not available:

```typescript
makeAutoObservable(this, {
  fetchData: flow,
})
```

## Action Declaration

Both `autoBind` and no-`autoBind` are valid MobX conventions — they only differ in how actions are invoked at call sites. Pick one and apply it consistently.

### autoBind

With `autoBind: true`, actions are bound to the instance, so they can be destructured and passed directly as callbacks without losing `this`:

```typescript
class LauncherStore {
  constructor() {
    makeAutoObservable(this, {}, { autoBind: true })
  }

  open(): void {
    this.isOpen = true
  }
}
```

```typescript
// ✅ Safe with autoBind
const { open, close, toggle } = launcher
open()
```

```typescript
// ❌ Wrong - arrow function (not needed with autoBind, breaks prototype)
open = (): void => {
  this.isOpen = true
}
```

### No autoBind

Without `autoBind`, **do not destructure methods or pass them directly as callbacks** — they will lose `this` binding. Call actions through the store instance instead:

```typescript
// ❌ Wrong - loses `this`
const { open } = store
open()

// ❌ Wrong - loses `this`
<Button onPress={store.open} />
```

Instead, wrap with an arrow function or `useCallback`:

```typescript
// ✅ Arrow wrapper preserves `this`
<Button onPress={() => store.open()} />

// ✅ useCallback wrapper (when passing to child components)
const handleOpen = useCallback(() => store.open(), [store])
<Button onPress={handleOpen} />
```

### Chosen convention: no autoBind

PixelPict uses **no `autoBind`** in all stores (global/singleton stores included) — `makeAutoObservable(this)` everywhere, and actions are always invoked via the store instance (`store.actionName()`). Never destructure methods; destructuring observable **values** is fine (see Component Observer Pattern).

**Performance note:** `autoBind: true` allocates a bound wrapper function per method per store instance. For a singleton store that's one-time and negligible, but for component-local stores (many instances) it adds per-instance memory overhead. Applying no-`autoBind` uniformly keeps the convention consistent and avoids that cost entirely.

## Component Observer Pattern

### Destructuring in Observer Components

When using MobX with React Compiler enabled, **destructure observable store properties inside the `observer`-wrapped component** rather than accessing observable properties directly through the store object in JSX.

```typescript
function ChatLauncherInner({ portalHostName }: Props) {
  const launcher = useAskCopart().launcher
  const { isOpen } = launcher

  return (
    <Fragment>
      <Pressable onPress={() => launcher.toggle()}>
        <Text>{isOpen ? 'Open' : 'Closed'}</Text>
      </Pressable>
    </Fragment>
  )
}

export const ChatLauncher = observer(ChatLauncherInner)
```

Prefer:

```typescript
const { isOpen } = launcher

return <Text>{isOpen ? 'Open' : 'Closed'}</Text>
```

over:

```typescript
return <Text>{launcher.isOpen ? 'Open' : 'Closed'}</Text>
```

### Why Destructuring Is Required

This is **not a fundamental MobX requirement**.

Normally, these two forms are equivalent from MobX's perspective:

```typescript
const isOpen = launcher.isOpen

return <Text>{isOpen ? 'Open' : 'Closed'}</Text>
```

and:

```typescript
return <Text>{launcher.isOpen ? 'Open' : 'Closed'}</Text>
```

However, with the experimental React Compiler enabled, direct observable property access can behave incorrectly after the compiler transforms the component.

For example, MobX can correctly report that the observer was invalidated:

```text
[mobx.trace] observerChatLauncherInner is invalidated due to a change in:
[AskLauncherStore@3.isOpen]
```

while the JSX expression using:

```typescript
launcher.isOpen
```

may still fail to display the updated value.

Reading the observable into a local variable during the observer render:

```typescript
const { isOpen } = launcher
```

avoids this problematic interaction with the React Compiler.

Therefore, **destructuring observable values is currently a compatibility workaround for React Compiler + MobX**, rather than a general MobX rule.

### Summary

The following conventions are recommended for this project because **React Compiler is currently enabled**:

1. **Use `makeAutoObservable`** for all stores (unless the class has a superclass).

2. **Do not use `autoBind`.** Actions are invoked via the store instance (`store.actionName()`).

3. **Never destructure or pass methods directly as callbacks.** Use arrow wrappers or `useCallback` instead.

4. **All updates must be immutable from leaf to parent.** Spread objects, create new `Map`/`Set`, produce new arrays — and reassign every parent up to the root observable.

5. **Destructure observable values inside `observer` components.**

   ```typescript
   const { isOpen } = launcher
   ```

6. **Use the destructured values in JSX.**

   ```typescript
   <Text>{isOpen ? 'Open' : 'Closed'}</Text>
   ```

7. **No `autoBind` anywhere** — the rule in item 3 applies to global/singleton stores as well as component-local stores.

8. Treat the observable-value destructuring requirement as a **React Compiler compatibility workaround**, not as a general requirement of MobX itself.

9. **Use `useMobxSelector` for granular reactivity with `Map`/`Set` lookups or nested object access** — destructuring the parent and reading a child causes re-renders for every sibling change due to immutable parent references. `useMobxSelector` tracks only the specific value returned by the selector.

If React Compiler is disabled in the future, items 5–8 should be reevaluated. In particular, direct observable property access such as `launcher.isOpen` should normally be valid with `mobx-react-lite`'s `observer`.
