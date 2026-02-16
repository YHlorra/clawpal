import type { Recipe } from "../lib/types";

export function RecipeCard({ recipe, onInstall }: { recipe: Recipe; onInstall: (id: string) => void }) {
  return (
    <article className="recipe-card">
      <h3>{recipe.name}</h3>
      <p>{recipe.description}</p>
      <div className="meta">
        {recipe.tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>
      <p>Impact: {recipe.impactCategory}</p>
      <button onClick={() => onInstall(recipe.id)}>Install</button>
    </article>
  );
}
