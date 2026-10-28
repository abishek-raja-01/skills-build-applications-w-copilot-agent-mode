import { useEffect, useState } from 'react';
import { getJson } from '../api/client.js';

type Props = {
  title: string;
  description: string;
  endpoint: string;
  dataKey: string;
  emptyMessage: string;
  fields: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function CapabilityCard({ title, description, endpoint, dataKey, emptyMessage, fields }: Props) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getJson<Record<string, unknown>>(endpoint)
      .then((response) => {
        const data = response[dataKey];
        if (!Array.isArray(data) || !data.every(isRecord)) {
          throw new Error(`Invalid ${title.toLowerCase()} response`);
        }
        if (!cancelled) setItems(data);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : String(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dataKey, endpoint, title]);

  return (
    <section className="card h-100">
      <div className="card-body">
        <h2 className="h4">{title}</h2>
        <p>{description}</p>
        {loading ? (
          <p role="status">Loading {title.toLowerCase()}...</p>
        ) : error ? (
          <p role="alert">Unable to load {title.toLowerCase()}: {error}</p>
        ) : items.length === 0 ? (
          <p>{emptyMessage}</p>
        ) : (
          <ul className="list-group">
            {items.map((item, index) => {
              const label = fields
                .map((field) => item[field])
                .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
                .join(' · ');
              return <li className="list-group-item" key={`${index}-${label}`}>{label}</li>;
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
