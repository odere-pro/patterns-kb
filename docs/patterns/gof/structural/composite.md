---
title: Composite
description: Tree structures — treat parts and wholes alike
area: gof-structural
owner: Oleksandr Derechei
tags: [low-level-design, composition, polymorphism, abstraction]
status: stable
solves: [every method has to check whether it got one item or a list of them, I am hand-writing the same recursion again for each new operation on my tree, adding up a total across nested groups means casting and branching all over the place, my code cares whether something is a single file or a folder and it should not, nesting a group inside another group breaks all my callers]
---

# Composite

Arranges objects into part-whole trees behind a single interface, so a leaf and an entire branch answer the same calls — and client code walks the whole structure without ever asking how deep it goes.

## What it is
<!--meta block=description-->

The **Composite** pattern arranges objects into tree structures to represent part-whole hierarchies. A common Component interface is implemented by two kinds of object: leaves, which are individual, indivisible elements, and composites, which are containers holding a list of child components — each of which may itself be a leaf or another composite. Client code calls the same operations on both.

The force it resolves is the endless branching that appears when "a single thing" and "a group of things" have different types. Without a shared interface, every operation that touches the structure has to ask `is this one item or a collection?`, cast accordingly, and hand-roll the recursion — logic that multiplies with every new operation and every level of nesting.

Composite pushes the recursion into the objects. A composite implements each operation by iterating its children and forwarding the call, letting results fold back up the tree; a leaf simply does the work directly. Because both expose one interface, depth becomes invisible to the caller — the same line of code sums one file or a whole directory tree.

The catch is where child management lives. Put `add` and `remove` on the shared interface and callers stay uniform but leaves inherit methods that make no sense; keep them on the composite alone and you regain type safety but lose the very uniformity that made the pattern attractive.

## Explained
<!--meta block=explain-->

A composite gives single items and groups of items one shared interface. A group holds a list of children, each either a single item or another group, and forwards every call to them. Callers make the same call on a file or on a whole folder and never see how deep the tree goes, so each operation is written once. Choose it when the data truly is a part-whole tree, such as folders, menus or an org chart, and callers have no business steering the descent. For a flat list, a node type is wasted. The first cost is a lie in the shared interface: if it carries an add-child method, single items inherit methods that mean nothing, which moves type errors from compile time to run time. Keep add-child on the group type only, and accept one cast where you build the tree. Second, a very deep or accidentally looping tree overflows the stack or never returns, so refuse repeats and cap the depth. Limiting which children a group accepts is awkward, so check it in the add method.

**Example.** A folder tree has 3 folders and 5 files of 10, 20, 30, 40 and 50 KB. Calling size() on a file returns its own size, and on a folder it returns the sum of its children's size(). Calling size() on the root returns 150 KB in one line, however deep the nesting. A bug then adds the root into one of its own subfolders, and size() recurses until the stack overflows. The fix is to make add() refuse any child that already contains the parent. The cost is walking part of the tree on every add.

## How it works
<!--meta block=structure-->

```mermaid caption="Leaf and Composite share the Component interface. A Composite holds children that are themselves Components, so a tree nests to any depth and every node answers the same call."
classDiagram
    class Component {
        +operation()
    }
    class Leaf {
        +operation()
    }
    class Composite {
        +operation()
        +add(child)
        +remove(child)
    }
    Component <|-- Leaf
    Component <|-- Composite
    Composite o-- Component : children
```

## Variations
<!--meta block=variations-->

- **Transparent vs. safe** — Declare child-management (`add`, `remove`, `getChild`) on the Component interface for a uniform but unsafe API where leaves must reject them — or only on Composite for a type-safe API where clients must distinguish the two.
- **Explicit parent links** — Each child keeps a back-reference to its parent, enabling upward traversal, moves, and cheap removal — at the cost of keeping the pointer consistent on every mutation.
- **Ordered children** — When order matters — a document, a UI layout — the composite keeps an ordered list and exposes index-based insertion and access rather than a bare set.
- **Cached aggregates** — A composite caches a rolled-up result (total size, bounding box) and invalidates it when a child changes, trading memory for the cost of re-walking the subtree.
- **Shared leaves** — Stateless leaves can be shared across many parents as Flyweights, shrinking otherwise enormous trees down to a handful of distinct instances.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Calling code treats one item** and a group of items the same way — no type checks, no casts, no special cases.
- **New kinds of node** slot in without touching existing client code.
- **Operations recurse naturally over the whole tree**, and the caller never sees how deep it goes.
- **Fits naturally recursive domains** — file systems, UI widget trees, org charts, expression trees.

### Cons
<!--meta polarity=con-->

- **The shared interface can be too broad** — leaves end up with add/remove-child methods that mean nothing for them.
- **Type safety slips**: you fall back on runtime checks or thrown errors instead of compile-time guarantees.
- **Hard to restrict a container** to accept only certain kinds of child.
- **Very deep or accidentally looping trees** can blow the stack or recurse forever if you don't guard them.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **Your domain is naturally a part-whole tree** — files and folders, groups and items, nested UI.
- **You want calling code to ignore** whether it's holding one object or a whole group of them.
- **An operation should walk a structure** of any depth without the caller steering the descent.

### Avoid when
<!--meta polarity=avoid-->

- **The structure is flat**, or a plain list or map already models it cleanly.
- **Single items and containers genuinely need different interfaces**, and merging them would hide bugs.
- **You need strict compile-time control** over exactly which children a container may hold.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — a file tree that sizes uniformly"
// One interface every node answers to — leaf and container alike.
interface FsNode {
  readonly name: string;
  size(): number;                 // the uniform operation
}

class FileNode implements FsNode {          // leaf
  constructor(
    readonly name: string,
    private readonly bytes: number,
  ) {}
  size(): number { return this.bytes; }
}

class Folder implements FsNode {            // composite
  private readonly children: FsNode[] = [];
  constructor(readonly name: string) {}

  add(node: FsNode): this { this.children.push(node); return this; }

  size(): number {                          // recurse over children, fold up
    return this.children.reduce((total, child) => total + child.size(), 0);
  }
}

const root = new Folder("root")
  .add(new FileNode("readme.md", 1_200))
  .add(new Folder("src").add(new FileNode("index.ts", 8_400)));

root.size();  // 9600 — a file and a folder answer the very same call
```

## In the wild
<!--meta block=wild-->

- **The DOM** — Every node — element, text, comment — exposes the same Node interface with childNodes, appendChild, and removeChild; a leaf text node still has appendChild, it just throws HierarchyRequestError, making the DOM the textbook transparent composite. Whole-subtree operations like cloneNode(true) and textContent recurse without the caller ever managing the descent. {#wild-dom}
- **Java Swing / AWT Container** — java.awt.Container extends Component yet holds a list of child Components, so a panel of nested panels sits in the same tree as a lone button. Painting, validation, and layout all recurse through the hierarchy — validate() walks the subtree and each container delegates the positioning of its own children to its LayoutManager. {#wild-swing-container}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **Traversal strategy** — Recursive descent is the natural fit but spends one call-stack frame per level of nesting; an explicit work-stack or queue trades a little clarity for immunity to arbitrarily deep trees.
- **Depth and size caps** — When the tree is built from external input, an explicit limit on nesting depth or total node count, enforced at insertion or parse time, keeps a hostile or malformed document from building a pathological structure.

### Signals to watch
<!--meta polarity=signal-->

- **Tree depth and node count** — Both stack use and full-walk cost scale with them; a creeping maximum depth is the early warning before the first overflow in production.
- **Duration of whole-tree operations** — An uncached aggregate walk grows linearly with the node count; a super-linear trend usually means the same subtree is being re-walked inside a loop.

### Failure modes under load
<!--meta polarity=failure-->

- **Stack overflow on deep trees** — Recursive operations consume a stack frame per level, so a deeply nested — or deliberately adversarial — tree crashes the process where a shallow test tree never did.
- **Cycles that never terminate** — If a node becomes reachable from its own descendants through aliased subtrees or broken parent bookkeeping, a plain recursive walk loops forever or double-counts shared nodes.
- **Quadratic re-aggregation** — Calling a rolled-up operation such as size or bounds inside a loop re-walks the whole subtree every time; caching the aggregate fixes the cost but then a missed invalidation quietly serves stale totals.

### Readiness checklist
<!--meta polarity=check-->

- Decide transparent vs safe child management up front, and document what a leaf does when asked to add a child — throw, ignore, or signal failure.
- Guard traversal against depth and cycles whenever the tree comes from untrusted input — cap nesting or switch to an explicit stack.
- If composites cache aggregates, exercise every mutation path — add, remove, and in-place child edits — and assert the cache invalidates.
- Test the degenerate shapes: the empty composite and the single-leaf tree are where fold identities and base cases go wrong.

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Frontend Architecture](../../../themes/frontend-architecture.md) — Treat the component tree uniformly {#fluency-frontend-architecture}
- [Object Structure](../../../themes/object-structure.md) — Build a tree so a single element and a group answer the same calls. {#fluency-object-structure}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Iterator](../behavioral/iterator.md) — Iterate a tree uniformly
- [Visitor](../behavioral/visitor.md) — Apply an operation across a whole tree
- [Atomic Design](../../frontend/atomic-design.md) — Atomic design is composite plus a naming discipline for a design system
- [Flyweight](./flyweight.md) — Leaf nodes with identical content can be one shared instance
- [Interpreter](../behavioral/interpreter.md) — A grammar's nonterminals are composites holding sub-expressions
- [Chain of Responsibility](../behavioral/chain-of-responsibility.md) — Unhandled requests can climb from child to parent up the tree
- [Specification](../../enterprise/specification.md) — A specification tree is a composite of rules.

**Often confused with**

- [Decorator](./decorator.md) — Both wrap recursively; intent differs

**Demonstrated by**

- [File System](../../../designs/file-system.md) — the file/folder/base hierarchy is the textbook Composite — a leaf and a container sharing one interface and handled uniformly

<!-- relationships:end -->
