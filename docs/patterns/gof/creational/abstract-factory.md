---
title: Abstract Factory
description: Families of related objects behind one interface
area: gof-creational
owner: Oleksandr Derechei
tags: [low-level-design, decoupling, lifecycle, abstraction, extensibility]
status: stable
aliases: [kit]
solves: [someone paired a Postgres connection with SQLite-flavoured SQL and it exploded at runtime, nothing stops a caller from mixing a dark-theme header with a light-theme sidebar, supporting a second platform sprayed if-statements about the OS through all my UI code, my objects only work in matched sets and nothing in the code enforces that, I want to swap the entire storage backend for tests but the pieces are constructed in twenty places]
---

# Abstract Factory

Hands the client one interface that produces a whole family of matching objects — so switching from one family to another, one theme, one platform, one backend, is a single change of factory.

## What it is
<!--meta block=description-->

Objects that must be used together, such as a button, a checkbox and a menu for one platform, are easy to mix across families. An abstract factory is one interface that creates a whole matching set, with one concrete factory per family. The client never names a concrete class, so a mismatched combination cannot be built.

## Explained
<!--meta block=explain-->

An abstract factory is an object that creates a whole set of related products, such as a button, a checkbox and a menu, through one interface, with one concrete factory per family such as Windows, macOS or a dark theme. The client asks the factory for each product and never names a concrete class, so every product it holds comes from the same family. Choose it over calling constructors directly when two or more products must travel together and a mismatch, such as a Windows button in a macOS dialog, would be a real bug. With one family, or product kinds that change more often than families, plain constructors are cheaper and clearer.

- **Rigid product list.** One new product kind means editing the factory interface and every family behind it. Keep the list short and stable.
- **Invisible family.** The call site does not show which family is in use, since it was chosen at assembly. Log it at startup.
- **More layers.** Extra classes and indirection compared with calling a constructor.

**Example.** A UI toolkit has 3 families (Windows, macOS, Linux) and 2 product kinds (button, checkbox). That is 6 product classes and 3 factories, and a dialog built from the macOS factory cannot receive a Windows checkbox. Now design asks for a slider. The factory interface gains a createSlider method, so all 3 factories need an edit and you write 3 slider classes: 6 changes. Adding a fourth family instead costs one factory and 3 product classes, with no change to any dialog. That asymmetry is the trade: new families are cheap, new product kinds are not.

## How it works
<!--meta block=structure-->

```mermaid caption="The client depends only on the GUIFactory interface. Each concrete factory produces one consistent family of products."
classDiagram
    class GUIFactory
    Client --> GUIFactory
    GUIFactory <|.. WinFactory
    GUIFactory <|.. MacFactory
    WinFactory --> WinButton
    MacFactory --> MacButton
```

## Variations
<!--meta block=variations-->

- **[Factory-Method internals](./factory-method.md)** — Each `create*` operation is itself a Factory Method that concrete factories override — the classic way the two patterns compose.
- **[Prototype](./prototype.md)-backed factory** — The factory stores prototypical instances and clones them per request, so a single factory class can serve many families without a subclass each.
- **[Singleton](./singleton.md) factory** — Because one factory per family usually suffices, concrete factories are frequently exposed as singletons or injected once at composition time.
- **Registry / parameterized factory** — A single factory keyed by a family identifier looks products up in a map instead of dedicating a subclass to every family.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Objects a client uses together** always come from one matching family, so mismatched pieces can't be built.
- **Callers talk only to interfaces**, never to concrete classes, so implementations stay swappable.
- **Switching to a whole new family** — a theme, a platform, a backend — is one change: which factory you create.
- **Keeps all the object-creation logic in one place**, which simplifies testing and wiring.

### Cons
<!--meta polarity=con-->

- **Adding a new kind of product** means editing the interface and every factory that implements it.
- **More classes and layers of indirection** than simply calling a constructor.
- **Overkill when there is only one family**, or the products never change as a set.
- **The set of products is fixed up front**, so a product type added later fits awkwardly.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **Your code has to work** with several interchangeable families of related objects without knowing which one it's using.
- **You need a guarantee** that objects created together are compatible with each other.
- **You want to pick** and configure a whole family in one place — at startup, or in a dependency-injection container.

### Avoid when
<!--meta polarity=avoid-->

- **There is only one family**, or the products never need to vary as a matched set.
- **New kinds of product appear often**, since each one forces edits across every factory.
- **Simpler options already work** — a single [Factory Method](./factory-method.md) or a plain constructor already does the job.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — a theme factory producing a matched family of widgets"
interface Button { readonly label: string; render(): string }
interface Panel { readonly title: string; render(): string }

// A factory promises a matched set of widgets for one theme.
interface WidgetFactory {
  createButton(label: string): Button;
  createPanel(title: string): Panel;
}

class DarkThemeFactory implements WidgetFactory {
  createButton(label: string): Button {
    return { label, render: () => `<button class="dark">${label}</button>` };
  }
  createPanel(title: string): Panel {
    return { title, render: () => `<section class="dark">${title}</section>` };
  }
}

class LightThemeFactory implements WidgetFactory {
  createButton(label: string): Button {
    return { label, render: () => `<button class="light">${label}</button>` };
  }
  createPanel(title: string): Panel {
    return { title, render: () => `<section class="light">${title}</section>` };
  }
}

// The client depends only on the interfaces — one factory swaps the whole set.
function renderToolbar(factory: WidgetFactory): string {
  return factory.createPanel("Settings").render() +
    factory.createButton("Save").render();
}

const prefersDark = true;
const theme: WidgetFactory = prefersDark
  ? new DarkThemeFactory()
  : new LightThemeFactory();
console.log(renderToolbar(theme));
```

## In the wild
<!--meta block=wild-->

- **.NET DbProviderFactory** — The abstract System.Data.Common.DbProviderFactory declares CreateConnection, CreateCommand, CreateParameter and CreateCommandBuilder; each ADO.NET provider ships a concrete subclass (for example SqlClientFactory.Instance) returning a matched set for one database. DbProviderFactories.GetFactory resolves one by provider invariant name, so the same data-access code runs against any registered provider without naming its classes. {#wild-dbproviderfactory}
- **Swing Look and Feel** — UIManager holds the current LookAndFeel, and each look and feel supplies the matching UI delegate for every Swing component, so buttons, scroll bars and menus all come from one family. Switching the look and feel swaps the whole family at once. {#wild-swing-look-and-feel}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **How the factory is chosen** — From config at startup, by environment, or by a registry keyed on name.
- **Family size** — The number of products one factory makes. Each new product type touches every concrete factory.
- **Factory lifetime** — One instance per process or per request. Factories that hold connections or caches need an owner.
- **Where the factory is wired** — At the composition root, so the rest of the code receives a factory and never builds one.

### Signals to watch
<!--meta polarity=signal-->

- **Concrete class names outside factories** — Direct constructor calls for products in code that should use the factory.
- **Factory count** — Concrete factories in the codebase. Few is the expected case.
- **Mixed-family objects** — Run-time errors from products of two families used together.
- **Product interface changes** — How often a product type is added, since each one edits every factory.

### Failure modes under load
<!--meta polarity=failure-->

- **Family mixing** — Code builds one product from one factory and another from a second, and they do not work together. Pass one factory through.
- **New product type cost** — Adding a product forces an edit to the abstract factory and every concrete factory.
- **Factory for one family** — Only one concrete factory exists and the abstraction adds files with no variation.
- **Hard-wired factory** — Code reads a global factory and tests cannot replace it. Inject it.

### Readiness checklist
<!--meta polarity=check-->

- Only the composition root names a concrete factory
- Each concrete factory has a test that builds every product
- Products from one factory are used together, checked in a test
- The family is stable, or the cost of a new product type is accepted

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Object Creation](../../../themes/object-creation.md) — Get a matching set of objects without naming their concrete classes. {#fluency-object-creation}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Prototype](./prototype.md) — A concrete factory can clone registered prototypes instead of newing them
- [Singleton](./singleton.md) — One concrete factory per family, usually held as a single instance
- [Bridge](../structural/bridge.md) — A family factory is a natural place to choose a bridge's implementor

**Alternative to**

- [Builder](./builder.md) — Families of products vs. one product built in steps

**Composed of**

- [Factory Method](./factory-method.md) — Its product methods are usually Factory Methods

<!-- relationships:end -->
