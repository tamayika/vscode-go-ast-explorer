
import * as vscode from 'vscode';
import { getAst } from './goAst';
import { OPEN_SELECTION_COMMAND_ID } from './commands';

export function createNodeFromDocument(document: vscode.TextDocument | undefined): Promise<Node | undefined> {
    if (!document) {
        return Promise.resolve<Node | undefined>(undefined);
    }
    return getAst(document, undefined);
}

export class AstProvider implements vscode.TreeDataProvider<Node> {

    private _onDidChangeTreeData: vscode.EventEmitter<Node | null> = new vscode.EventEmitter<Node | null>();
    readonly onDidChangeTreeData: vscode.Event<Node | null> = this._onDidChangeTreeData.event;

    private tree: Node | undefined;
    private document: vscode.TextDocument | undefined;
    private timeoutHandler: NodeJS.Timer | undefined;
    private selectHandler: vscode.Disposable | undefined;

    public treeView: vscode.TreeView<Node> | undefined;

    constructor() {
        vscode.window.onDidChangeActiveTextEditor(editor => {
            this.tree = undefined;
            if (editor) {
                this.parseTree(editor.document, true);
            }
        });
        vscode.workspace.onDidChangeTextDocument(e => {
            this.parseTree(e.document, false);
        });

        this.listenConfigurationChange();

        if (vscode.window.activeTextEditor) {
            this.parseTree(vscode.window.activeTextEditor.document, true);
        }
    }

    listenConfigurationChange() {
        if (this.selectHandler) {
            this.selectHandler.dispose();
            this.selectHandler = undefined;
        }

        const config = vscode.workspace.getConfiguration("go-ast", null).get<boolean>("selectOnMove");
        if (config) {
            this.selectHandler = vscode.window.onDidChangeTextEditorSelection(e => {
                this.show();
            });
        }
    }

    private parseTree(document: vscode.TextDocument | undefined, force: boolean) {
        if (document && document.languageId === 'go') {
            if (this.timeoutHandler !== undefined) {
                clearTimeout(this.timeoutHandler);
            }
            this.timeoutHandler = setTimeout(() => {
                const result = createNodeFromDocument(document);
                if (result === undefined) {
                    return;
                }
                result.then((node) => {
                    if (!node) {
                        return;
                    }
                    this.setParent(node);
                    this.tree = node;
                    this.document = document;
                    this._onDidChangeTreeData.fire();
                });
            }, force ? 0 : 2000);
        }
    }

    private setParent(node: Node) {
        for (const child of node.children) {
            child.parent = node;
            this.setParent(child);
        }
    }

    getTreeItem(element: Node): vscode.TreeItem | Thenable<vscode.TreeItem> {
        const children = this.getChildren(element) as Node[];
        const hasChildren = children && children.length > 0;
        const it = new vscode.TreeItem(`${element.type} (${element.pos}, ${element.end})`,
            hasChildren ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
        if (this.document) {
            const document = this.document;
            it.command = {
                command: OPEN_SELECTION_COMMAND_ID,
                title: '',
                arguments: [() => {
                    return new vscode.Range(this.offsetToPosition(document, element.pos - 1), this.offsetToPosition(document, element.end - 1));
                }]
            };
        }
        return it;
    }

    private offsetToPosition(document: vscode.TextDocument, offset: number): vscode.Position {
        const allText = document.getText();
        let start = 0;
        let end = allText.length;
        while (end - start >= 1) {
            const next = parseInt(((end + start) / 2).toString());
            const subText = allText.substr(0, next);
            const byteLentgh = Buffer.byteLength(subText);
            if (byteLentgh === offset) {
                start = end = next;
                break;
            }
            if (byteLentgh < offset) {
                start = next;
            } else {
                end = next;
            }
        }
        return document.positionAt(start);
    }

    getChildren(element?: Node): vscode.ProviderResult<Node[]> {
        const children = element ? element.children : this.tree ? this.tree.children : [];
        return children.length === 0 ? undefined : children;
    }

    getParent(element: Node): Node | undefined {
        return element.parent;
    }

    select(range: vscode.Range) {
        if (vscode.window.activeTextEditor) {
            vscode.window.activeTextEditor.selection = new vscode.Selection(range.start, range.end);
            vscode.window.activeTextEditor.revealRange(range);
        }
    }

    show() {
        if (vscode.window.activeTextEditor && this.tree && this.treeView) {
            const range = new vscode.Range(new vscode.Position(0, 0), vscode.window.activeTextEditor.selection.active);
            const offset = Buffer.byteLength(vscode.window.activeTextEditor.document.getText(range)) + 1;
            const node = this.findNearest(offset, this.tree);
            if (!node) {
                return;
            }
            this.treeView.reveal(node);
        }
    }

    private findNearest(pos: number, parent: Node): Node | undefined {
        if (parent.pos <= pos && pos <= parent.end) {
            for (const child of parent.children) {
                const foundChild = this.findNearest(pos, child);
                if (foundChild) {
                    return foundChild;
                }
            }
            return parent;
        }
        return undefined;
    }
}