type Node = {
    type: string,
    pos: number,
    end: number,
    children: Node[],
    parent: Node | undefined,
};

type NodeSpan = {
    pos: number,
    end: number,
};
