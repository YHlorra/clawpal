import type { Recipe } from "../lib/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function RecipeCard({
  recipe,
  onCook,
  compact,
}: {
  recipe: Recipe;
  onCook: (id: string) => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Card
        className="cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => onCook(recipe.id)}
      >
        <CardContent>
          <strong>{recipe.name}</strong>
          <div className="text-sm text-muted-foreground mt-1.5">
            {recipe.description}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            {recipe.steps.length} step{recipe.steps.length !== 1 ? "s" : ""} &middot; {recipe.difficulty}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{recipe.name}</CardTitle>
        <CardDescription>{recipe.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {recipe.tags.map((t) => (
            <Badge key={t} variant="secondary" className="bg-muted-foreground/15">
              {t}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {recipe.steps.length} step{recipe.steps.length !== 1 ? "s" : ""} &middot; {recipe.difficulty}
        </p>
      </CardContent>
      <CardFooter>
        <Button onClick={() => onCook(recipe.id)}>
          Cook
        </Button>
      </CardFooter>
    </Card>
  );
}
