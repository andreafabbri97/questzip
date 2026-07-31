// La libreria non pubblica tipi TypeScript (pacchetto JS puro, niente campo "types" nel suo
// package.json) — dichiarazione minima solo per zittire il type-checker sull'import dinamico;
// la forma effettiva usata è già ricostruita a mano in components/dice-3d.tsx.
declare module "@3d-dice/dice-box" {
  const DiceBox: unknown;
  export default DiceBox;
}
