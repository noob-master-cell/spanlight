/** A screen-reader twin of a chart: the same numbers as a plain table. */
export interface ChartDataTable {
  caption: string;
  columns: string[];
  rows: { key: string; cells: string[] }[];
}

/** Visually hidden; assistive technology reads the chart's data from it. */
export function ChartDataTableView({ table }: { table: ChartDataTable }) {
  return (
    <table className="sr-only">
      <caption>{table.caption}</caption>
      <thead>
        <tr>
          {table.columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row) => (
          <tr key={row.key}>
            {row.cells.map((cell, index) => (
              <td key={table.columns[index] ?? index}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
