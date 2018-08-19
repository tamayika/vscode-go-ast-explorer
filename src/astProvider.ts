
import * as vscode from 'vscode';
import { getAst } from './goAst';
import { OPEN_SELECTION_COMMAND_ID } from './commands';

export function createNodeFromActiveEditor(): { editor: vscode.TextEditor, node: Promise<Node> } | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return undefined;
    }
    const doc = editor.document;
    const node = getAst(doc, undefined);
    return { editor, node };
}

export class AstProvider implements vscode.TreeDataProvider<Node> {

    private _onDidChangeTreeData: vscode.EventEmitter<Node | null> = new vscode.EventEmitter<Node | null>();
    readonly onDidChangeTreeData: vscode.Event<Node | null> = this._onDidChangeTreeData.event;

    private tree: Node | undefined;
    private editor: vscode.TextEditor | undefined;
    private timeoutHandler: NodeJS.Timer | undefined;

    constructor() {
        vscode.window.onDidChangeActiveTextEditor(editor => {
            this.parseTree(editor, true);
        });
        vscode.window.onDidChangeTextEditorSelection(e => {
            this.parseTree(e.textEditor, false);
        });

        this.parseTree(vscode.window.activeTextEditor, true);
    }

    private parseTree(editor: vscode.TextEditor | undefined, force: boolean): void {
        this.tree = undefined;
        this.editor = undefined;
        if (editor && editor.document && editor.document.languageId === 'go') {
            if (this.timeoutHandler !== undefined) {
                clearTimeout(this.timeoutHandler);
            }
            this.timeoutHandler = setTimeout(() => {
                const result = createNodeFromActiveEditor();
                if (result === undefined) {
                    return;
                }
                result.node.then((node) => {
                    this.tree = node;
                    this.editor = result.editor;
                    this._onDidChangeTreeData.fire();
                });
            }, force ? 0 : 2000);
        }
    }

    getTreeItem(element: Node): vscode.TreeItem | Thenable<vscode.TreeItem> {
        const children = this.getChildren(element) as Node[];
        const hasChildren = children && children.length > 0;
        const it = new vscode.TreeItem(`${element.type} (${element.pos}, ${element.end})`,
            hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        if (this.editor) {
            it.command = {
                command: OPEN_SELECTION_COMMAND_ID,
                title: '',
                arguments: [new vscode.Range(this.editor.document.positionAt(element.pos - 1), this.editor.document.positionAt(element.end - 1))]
            };
        }
        return it;
    }

    getChildren(element?: Node): vscode.ProviderResult<Node[]> {
        const children = element ? element.children : this.tree ? this.tree.children : [];
        return children.length === 0 ? undefined : children;
    }

    select(range: vscode.Range) {
        if (this.editor) {
            this.editor.selection = new vscode.Selection(range.start, range.end);
            this.editor.revealRange(range);
        }
    }
}