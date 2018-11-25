import * as vscode from 'vscode';
import { getNodeSpan } from './gaq';
import { offsetToPosition } from './util';

export class GaqProvider {
    private lastQuery: string | undefined;
    private lastDecorator: vscode.TextEditorDecorationType | undefined;
    private textChangeHandler: vscode.Disposable | undefined;

    public selectByQuery() {
        this.executeGaq((editor, spans) => {
            editor.selections = spans.map(span =>
                new vscode.Selection(
                    offsetToPosition(editor.document, span.pos - 1),
                    offsetToPosition(editor.document, span.end - 1)));
        });
    }

    public searchByQuery() {
        this.executeGaq((editor, spans) => {
            this.clearDecoration();
            this.lastDecorator = vscode.window.createTextEditorDecorationType({
                backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
            });
            editor.setDecorations(this.lastDecorator, spans.map(span =>
                new vscode.Range(offsetToPosition(editor.document, span.pos - 1),
                    offsetToPosition(editor.document, span.end - 1))));
            this.textChangeHandler = vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document !== editor.document) {
                    return;
                }
                this.clearDecoration();
            });
        });
    }

    private clearDecoration() {
        if (this.lastDecorator) {
            this.lastDecorator.dispose();
            this.lastDecorator = undefined;
        }
        if (this.textChangeHandler) {
            this.textChangeHandler.dispose();
            this.textChangeHandler = undefined;
        }
    }

    private executeGaq(callback: (editor: vscode.TextEditor, spans: NodeSpan[]) => void) {
        vscode.window.showInputBox({
            placeHolder: "Input GAQ Query",
            value: this.lastQuery,
        }).then(value => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || !value) {
                return;
            }
            getNodeSpan(editor.document, value, undefined).then(spans => {
                this.lastQuery = value;
                callback(editor, spans);
            });
        });
    }
}
