import Editor from "./Editor.svelte";
import { mount } from "svelte";
document.getElementById("editor-root");

mount(Editor, { target: document.getElementById("editor-root")! });
