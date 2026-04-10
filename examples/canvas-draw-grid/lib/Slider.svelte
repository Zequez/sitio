<script lang="ts">
  type Props = {
    values: number[];
    value: number;
    onChange?: (v: number) => void;
  };

  let { values, value, onChange }: Props = $props();

  function indexFromValue(v: number) {
    const i = values.indexOf(v);
    return i === -1 ? 0 : i;
  }

  function handleInput(e: Event) {
    const index = Number((e.target as HTMLInputElement).value);
    const v = values[index]!;
    onChange?.(v);
  }
</script>

<input
  type="range"
  min="0"
  max={values.length - 1}
  step="1"
  value={indexFromValue(value)}
  oninput={handleInput}
/>
