/**
 * GOWAYY category artwork.
 *
 * Rendered photographic-style 3D visuals (one consistent studio art direction),
 * generated as local WebP assets so no runtime 3D engine or remote sprite is
 * needed. The tile itself carries the accessible label, so the image is
 * decorative; motion is a single restrained hover lift with a reduced-motion
 * opt-out.
 */
export type CategoryArtKey =
  | 'cabs' | 'shared' | 'hotels' | 'food' | 'groceries' | 'tourism'
  | 'experiences' | 'packages' | 'shopping' | 'parcels';

const ART: Record<CategoryArtKey, string> = {
  cabs: 'cabs',
  shared: 'shared-taxi',
  hotels: 'hotels',
  food: 'food',
  groceries: 'groceries',
  tourism: 'tourism',
  experiences: 'experiences',
  packages: 'packages',
  shopping: 'shop',
  parcels: 'parcels',
};

export function CategoryArt({ kind }: { kind: CategoryArtKey }) {
  return (
    <span className="cat-art-wrap">
      <img
        className="cat-art cat-art--photo"
        src={`/images/categories/${ART[kind]}.webp`}
        alt=""
        width={512}
        height={512}
        loading={kind === 'cabs' ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
      />
    </span>
  );
}

export const CATEGORY_ART: Array<{ key: CategoryArtKey; label: string; to: string }> = [
  { key: 'cabs', label: 'Cabs', to: '/cabs' },
  { key: 'shared', label: 'Shared taxis', to: '/cabs?tab=shared' },
  { key: 'hotels', label: 'Hotels', to: '/hotels' },
  { key: 'food', label: 'Food', to: '/food' },
  { key: 'groceries', label: 'Groceries', to: '/groceries' },
  { key: 'tourism', label: 'Tourism', to: '/explore' },
  { key: 'experiences', label: 'Experiences', to: '/experiences' },
  { key: 'packages', label: 'Packages', to: '/packages' },
  { key: 'shopping', label: 'Shop', to: '/categories' },
  { key: 'parcels', label: 'Parcels', to: '/parcels' },
];
