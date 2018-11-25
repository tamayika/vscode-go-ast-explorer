# Go AST Explorer

Go AST Explorer adds ast treeview to VSCode explorer.

![preview](https://github.com/tamayika/vscode-go-ast-explorer/raw/master/image/dev.png)

## Configuration

|         key         |  type   | default |                description                |
| ------------------- | ------- | ------- | ----------------------------------------- |
| go-ast.selectOnMove | boolean | false   | Select matched ast node when cursor moved |

## Command

|               name               |                                           description                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Go AST: Select Nodes Text By GAQ | Select nodes text which matches input gaq query.                                                |
| Go AST: Search Nodes Text By GAQ | Highlight nodes text which matches input gaq query.<br> After editing text, highlight will be cleared. |


## License

See [LICENSE](https://github.com/tamayika/vscode-go-ast-explorer/blob/master/LICENSE)

Go AST Explorer heavily uses [vscode-go](https://github.com/Microsoft/vscode-go) codebase.