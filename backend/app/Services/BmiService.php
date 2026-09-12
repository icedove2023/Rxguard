<?php

namespace App\Services;

use App\Models\User;
use App\Models\BmiRecord;
use Illuminate\Support\Facades\Storage;

/**
 * BmiService
 *
 * Calculates BMI, assigns category, and generates
 * Nigeria-context nutrition and lifestyle recommendations.
 */
class BmiService
{
    /**
     * Full BMI calculation with recommendations.
     * Persists the record if a User is provided.
     */
    public function calculate(
        float   $heightCm,
        float   $weightKg,
        int     $age,
        string  $gender,
        ?User   $user = null
    ): array {
        $heightM = $heightCm / 100;
        $bmi     = round($weightKg / ($heightM * $heightM), 2);
        $category   = BmiRecord::categoryEnum($bmi);
        $label      = BmiRecord::categoryLabel($bmi);
        $nutrition  = $this->nutritionRecommendations($bmi, $gender, $age);
        $lifestyle  = $this->lifestyleRecommendations($bmi, $gender, $age);
        $idealRange = $this->idealWeightRange($heightCm, $gender);
        $pointer    = $this->gaugePointerPercent($bmi);

        $record = null;
        if ($user) {
            $record = BmiRecord::create([
                'user_id'        => $user->id,
                'height_cm'      => $heightCm,
                'weight_kg'      => $weightKg,
                'age'            => $age,
                'gender'         => $gender,
                'bmi_value'      => $bmi,
                'category'       => $category,
                'nutrition_recs' => $nutrition,
                'lifestyle_recs' => $lifestyle,
            ]);
        }

        return [
            'bmi'             => $bmi,
            'category_enum'   => $category,
            'category_label'  => $label,
            'category_color'  => $this->categoryColor($bmi),
            'gauge_percent'   => $pointer,
            'ideal_weight_kg' => $idealRange,
            'inputs'          => compact('heightCm', 'weightKg', 'age', 'gender'),
            'nutrition_recs'  => $nutrition,
            'lifestyle_recs'  => $lifestyle,
            'medical_note'    => 'BMI is a screening tool, not a diagnostic measure. '
                . 'Consult a MDCN-registered physician for a comprehensive health assessment.',
            'record_id'       => $record?->id,
            'recorded_at'     => $record?->recorded_at?->toISOString(),
        ];
    }

    // ----------------------------------------------------------------
    // Nutrition recommendations (Nigeria-contextualised)
    // ----------------------------------------------------------------

    private function nutritionRecommendations(float $bmi, string $gender, int $age): array
    {
        if ($bmi < 18.5) {
            return [
                'Increase caloric intake by 300–500 kcal/day using energy-dense whole foods',
                'Eat eba, pounded yam, oatmeal, and ofada rice as healthy calorie sources',
                'Include protein at every meal: eggs, beans, fish, chicken, groundnuts',
                'Add healthy fats: avocado, groundnut oil (moderate), coconut, palm kernel',
                'Eat 5–6 smaller meals throughout the day rather than 3 large ones',
                'Snack on bananas, groundnuts, garden eggs, and boiled plantain',
                'Consider Complan, Ensure, or similar supplements under dietitian guidance',
                'Rule out underlying causes: tuberculosis, HIV, diabetes, malabsorption',
            ];
        }

        if ($bmi < 25.0) {
            return [
                'Maintain a balanced diet with local whole grains: ofada rice, millet, sorghum',
                'Include lean proteins daily: tilapia, mackerel, chicken, beans, lentils',
                'Eat 5 portions of vegetables daily: ugwu, spinach, tomatoes, carrots',
                'Use palm oil and groundnut oil in moderate portions',
                'Limit processed foods, MSG-heavy seasonings, and fried snacks',
                'Drink 8–10 glasses of clean water daily; reduce sugary drinks',
                'Include calcium-rich foods: sardines with bones, crayfish, dairy products',
            ];
        }

        if ($bmi < 30.0) {
            return [
                'Reduce overall caloric intake by 300–500 kcal/day to achieve gradual weight loss',
                'Reduce portion sizes: use a smaller plate method; avoid "food for two"',
                'Replace white rice and eba with ofada rice, wheat, oat eba, or cauliflower rice',
                'Reduce palm oil and fried foods: grill, steam, or boil instead',
                'Avoid sugar-sweetened drinks: Fanta, Coke, malt drinks, packaged juice',
                'Eat more high-fibre foods: okra, efo riro, garden egg, African salad',
                'Limit alcohol consumption, especially palm wine and beer',
                'Reduce highly processed foods: instant noodles, biscuits, chin-chin, puff-puff',
            ];
        }

        // Obese
        return [
            'Seek guidance from a registered dietitian or nutritionist (NDN-registered)',
            'Adopt a structured low-calorie diet: target 1,200–1,500 kcal/day under supervision',
            'Eliminate all sugar-sweetened beverages and replace with water or zobo (unsweetened)',
            'Focus on non-starchy vegetables as meal base: efo, uziza, bitter leaf, spinach',
            'Limit starchy staples to small portions: 1 small wrap of eba or 1 cup of rice per meal',
            'Avoid fast food, roadside fried snacks, and processed meats (sausage, hot dog)',
            'Track food intake using a diary or mobile app',
            'Discuss medical nutrition therapy and pharmacological options with your physician',
        ];
    }

    // ----------------------------------------------------------------
    // Lifestyle recommendations
    // ----------------------------------------------------------------

    private function lifestyleRecommendations(float $bmi, string $gender, int $age): array
    {
        $senior = $age >= 60;

        if ($bmi < 18.5) {
            return [
                $senior
                    ? 'Gentle resistance exercises: light weights, resistance bands, chair exercises'
                    : 'Start strength training 3x/week: push-ups, squats, weightlifting',
                'Avoid excessive cardio which burns calories needed for weight gain',
                'Rest adequately: 8 hours of sleep per night supports muscle building',
                'Monitor weight weekly; target gain of 0.25–0.5 kg per week',
                'Visit a physician to rule out medical causes of underweight',
            ];
        }

        if ($bmi < 25.0) {
            return [
                'Maintain 150 minutes of moderate aerobic activity per week (brisk walking, swimming)',
                'Include 2 strength-training sessions per week',
                'Aim for 7,000–10,000 steps daily; use a pedometer or phone app',
                'Limit prolonged sitting; stand up every 30–45 minutes at work',
                'Sleep 7–9 hours nightly; poor sleep disrupts metabolism',
                'Regular health screenings: blood pressure, blood glucose, cholesterol',
                'Manage stress: prayer, community support, leisure activities',
            ];
        }

        if ($bmi < 30.0) {
            return [
                'Begin with 30 minutes of brisk walking daily; increase gradually',
                'Join a community walking group or aerobics class for accountability',
                'Reduce screen time; aim for less than 2 hours of leisure screen time daily',
                'Take the stairs, walk short distances instead of taking okada or keke',
                'Target 5–10% weight loss over 3–6 months as a realistic first goal',
                'Monitor blood pressure and blood sugar every 3 months',
                'Consult a physician if you have hypertension, diabetes, or joint pain',
            ];
        }

        // Obese
        return [
            'Start with supervised low-impact exercise: walking, water aerobics, cycling',
            'Join a hospital-based weight management programme if available',
            'Monitor for comorbidities: type 2 diabetes, hypertension, sleep apnoea',
            'Set incremental goals: 5% weight loss in 12 weeks reduces major health risks',
            'Consider referral to an endocrinologist or bariatric specialist',
            'Psychological support: body-image counselling, motivation groups',
            'Track steps and activity weekly; celebrate progress milestones',
        ];
    }

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    private function idealWeightRange(float $heightCm, string $gender): array
    {
        $h = $heightCm / 100;
        return [
            'min_kg' => round(18.5 * $h * $h, 1),
            'max_kg' => round(24.9 * $h * $h, 1),
        ];
    }

    private function categoryColor(float $bmi): string
    {
        return match (true) {
            $bmi < 18.5 => 'blue',
            $bmi < 25.0 => 'green',
            $bmi < 30.0 => 'amber',
            default     => 'red',
        };
    }

    private function gaugePointerPercent(float $bmi): float
    {
        // Map BMI 10–45 to 0–100%
        return round(min(100, max(0, ($bmi - 10) / 35 * 100)), 1);
    }
}

