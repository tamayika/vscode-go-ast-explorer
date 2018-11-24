import * as vscode from 'vscode';
import { getNodeSpan } from './gaq';
import { offsetToPosition } from './util';

export class GaqProvider {
    private lastQuery: string | undefined;

    public selectByQuery() {
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
                editor.selections = spans.map(span =>
                    new vscode.Selection(
                        offsetToPosition(editor.document, span.pos - 1),
                        offsetToPosition(editor.document, span.end - 1)));
            });
        });
    }
}