import { defineConfig } from "vite";
import leanscript from "@leanscript/vite-plugin";

export default defineConfig({
  plugins: [leanscript()],
});
