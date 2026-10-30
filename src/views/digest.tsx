import type { DigestResult } from '../digest/types.js';

function missing(value: string | null): string {
  return value ?? '—';
}

export function DigestPage({ night, digest }: { night: string; digest: DigestResult }) {
  return (
    <>
      <h1>digest · {night}</h1>
      <p class="mute">malformed lines: {digest.badLines}</p>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first at</th>
              <th>last at</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => {
              const manyRetries = row.retries >= 3;
              const failed = row.lastStatus === 'fail';
              return (
                <tr class={manyRetries || failed ? 'warn' : undefined}>
                  <td>{row.job}</td>
                  <td>{missing(row.owner)}</td>
                  <td>{row.runs}</td>
                  <td>{manyRetries ? <span class="warn">{row.retries}</span> : row.retries}</td>
                  <td>{failed ? <span class="warn">{row.lastStatus}</span> : row.lastStatus}</td>
                  <td>{missing(row.lastError)}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
