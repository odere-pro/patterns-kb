---
title: Visitor
description: Adds operations without changing the classes visited
area: gof-behavioral
owner: Oleksandr Derechei
tags: [low-level-design, polymorphism, composition, extensibility, separation-of-concerns]
status: stable
solves: [every new operation over my node types means editing all twenty classes, my serialization code is one long chain of instanceof checks, I keep bolting methods onto a class hierarchy that have nothing to do with what those classes are for, I want to walk this tree and total something up but the logic is scattered across the nodes, when I add a new node type nothing tells me which handlers I forgot to update]
---

# Visitor

Packages a new operation as an object you push through a stable class hierarchy — so you can teach a fixed set of types new tricks without editing a single one of them.

## What it is
<!--meta block=description-->

Operations such as printing, type-checking and cost estimates keep multiplying over a stable set of types, and each one means editing every class. Visitor moves each operation into its own object with one method per element type, and each element routes the call to the right method through accept. The price: a new element type touches every visitor.

## Explained
<!--meta block=explain-->

A visitor moves an operation out of the classes it works on and into its own object, which has one method for each type of element. Each element has an accept method that calls back the visitor method for its own type, so the right code runs without a chain of type checks. Adding an operation is then one new visitor and no edit to the elements. Choose it over a method on each element when the set of types is stable and operations keep multiplying: printing, type-checking, cost estimates. Where your language has exhaustive pattern matching over a small closed set of types, use that instead, with less machinery.

- **New element types.** Each one needs a new method in every visitor. Use a visitor interface so the compiler flags any visitor that missed one.
- **Boilerplate.** The accept methods are spread through the whole hierarchy.
- **Exposed internals.** Visitors need element internals, which weakens encapsulation, so expose read access only.

**Example.** A syntax tree has 4 node types: number, add, multiply and variable. You need 3 operations: evaluate, print and count nodes. As visitors that is 3 classes with 4 methods each, 12 methods, and the node classes never change. Add a fifth node type, power, and all 3 visitors need a new method, so 3 edits; if the visitor interface declares the method, the compiler lists the 3 visitors that lack it. Had you put the operations inside the nodes, a fourth operation would have meant editing all 4 node classes.

## How it works
<!--meta block=structure-->

```mermaid caption="Double dispatch. The first call resolves the concrete element type, the second resolves the concrete operation — together they select exactly one method."
sequenceDiagram
    autonumber
    participant C as Client
    participant E as Element
    participant V as Visitor
    C->>E: accept(visitor)
    E->>V: visitConcrete(this)
    alt visitor overrides this type
        V-->>E: run operation, return result
    else no override (base visitor)
        V-->>E: default no-op
    end
    E-->>C: result
```

## Variations
<!--meta block=variations-->

- **Classic double dispatch** — Every element implements `accept` and calls back the visitor's type-specific method. Fully type-safe, but the object structure must know about the visitor interface.
- **Acyclic Visitor** — Splits the monolithic visitor interface into one small interface per element, so a visitor implements only the types it cares about and new element types don't force a recompile of every visitor.
- **Reflective / dynamic Visitor** — Skips `accept` and dispatches on runtime type — `instanceof` checks or pattern matching. Less boilerplate, but you lose the compiler's exhaustiveness guarantee.
- **Default (base) Visitor** — Provides no-op defaults for every element so a concrete visitor overrides only the handful of nodes it needs — handy over large or generated hierarchies.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Add a new operation** without changing any of the element classes.
- **Keeps all of one operation's logic** in a single object, instead of scattered across the element classes.
- **Can build up state across a whole traversal** — running totals, reports, symbol tables.
- **Routes each concrete element** to the right handler safely, with no manual type checks.

### Cons
<!--meta polarity=con-->

- **Adding a new element type** forces a change to every existing visitor.
- **Boilerplate**: every element needs an `accept` method to route the call back (double dispatch).
- **Visitors often need to see an element's internals**, which weakens its encapsulation.
- **Overkill when there is only one operation**, or when it belongs on the element itself.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **The set of element types is stable**, but you keep adding new operations over them.
- **The operation doesn't really belong on the elements** — think serialization, pretty-printing, or type-checking.
- **You want a family of related operations** gathered together, separate from the data.

### Avoid when
<!--meta polarity=avoid-->

- **New element types appear often** — each one forces a change to every visitor.
- **There is a single operation**, or it sits naturally as a method on the element.
- **A plain switch or pattern match** over a small closed type set reads more clearly.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — an area visitor over a shape hierarchy"
interface ShapeVisitor<T> {
  circle(shape: Circle): T;
  square(shape: Square): T;
}
interface Shape {
  accept<T>(visitor: ShapeVisitor<T>): T;
}

class Circle implements Shape {
  constructor(readonly radius: number) {}
  accept<T>(visitor: ShapeVisitor<T>): T { return visitor.circle(this); }
}
class Square implements Shape {
  constructor(readonly side: number) {}
  accept<T>(visitor: ShapeVisitor<T>): T { return visitor.square(this); }
}

// A new operation, added with no change to any Shape class.
class AreaVisitor implements ShapeVisitor<number> {
  circle(shape: Circle): number { return Math.PI * shape.radius ** 2; }
  square(shape: Square): number { return shape.side ** 2; }
}

const shapes: readonly Shape[] = [new Circle(2), new Square(3)];
const area = new AreaVisitor();
const total = shapes.reduce((sum, shape) => sum + shape.accept(area), 0);
```

## In the wild
<!--meta block=wild-->

- **ANTLR** — Generates a base visitor with one visit method per grammar rule (alongside a listener variant), so each new pass over the parse tree is a visitor subclass overriding only the rules it cares about, with visitChildren as the walk-everything default. {#wild-antlr}
- **Babel** — Every plugin returns a visitor object keyed by abstract syntax tree (AST) node type (Identifier, CallExpression, ...); Babel walks the tree and invokes matching enter/exit handlers, and the NodePath handed to each gives scope and mutation helpers without touching the parser's node definitions. {#wild-babel}
- **Roslyn** — Exposes CSharpSyntaxVisitor for read-only walks and CSharpSyntaxRewriter for producing a modified tree. Because syntax nodes are immutable, a rewriter returns a new tree rather than mutating nodes, so analyzers and refactorings compose over the same tree safely. {#wild-roslyn}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **Double dispatch form** — An accept method on each element, or a type switch in the visitor. The switch avoids touching elements and loses the compiler check.
- **Return values** — Visitors that return a result, carry state in fields, or take a context argument.
- **Traversal ownership** — The elements walk their children, or the visitor does. The visitor-driven walk lets one visitor skip a subtree.
- **Default behavior** — A base visitor with empty or default visit methods, so a subclass handles only the nodes it cares about.

### Signals to watch
<!--meta polarity=signal-->

- **Element type changes** — How often new element types are added. Each addition touches every visitor, so frequent changes say the pattern is wrong here.
- **Visitor count** — Number of visitors in the codebase. Growth is the intended direction.
- **Traversal cost** — Time spent walking large structures, from a profiler.
- **Unhandled element hits** — Counts of nodes that reached a default visit method.

### Failure modes under load
<!--meta polarity=failure-->

- **New element breaks all visitors** — Adding an element type forces an edit in every visitor class. Compile errors show them if the interface is abstract.
- **Encapsulation leak** — Elements expose internals so visitors can read them.
- **Stack depth** — A recursive walk of a deep tree overflows the stack. Use an explicit stack.
- **State kept in visitor fields** — A visitor reused across traversals carries old state into the next one.

### Readiness checklist
<!--meta polarity=check-->

- Adding an element type is rare, or the element set is fixed
- Visitors are created fresh per traversal or reset before use
- Deep inputs are tested for stack depth
- Each visitor has a test over a small structure that includes every element type

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Object Behavior](../../../themes/object-behavior.md) — Move an operation out of a class hierarchy into a separate object. {#fluency-object-behavior}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Composite](../structural/composite.md) — Apply an operation across a whole tree
- [Interpreter](./interpreter.md) — Visitors evaluate interpreter node trees
- [Iterator](./iterator.md) — A traversal walks the structure and applies the visitor to each node

<!-- relationships:end -->
