import { mount } from "svelte";
import Draw from "./Draw.svelte";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

mount(Draw, {
  target: root,
});
