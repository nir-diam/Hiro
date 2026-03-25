
/**
 * Matching Service - The "Brain" of Hiro
 * Responsible for calculating the hybrid match score between candidates and jobs.
 */

export enum TagSource {
    RECRUITER = 'recruiter',
    CANDIDATE = 'candidate',
    AI = 'ai'
}

export interface Tag {
    id: string;
    name: string;
    category: string;
    source: TagSource;
    confidence: number; // 0 to 1
    score?: number; // Candidate's proficiency in this tag (0 to 100)
}

export interface MatchingConfig {
    mainWeights: {
        vector: number;
        tags: number;
        geo: number;
        experience: number;
    };
    tagCategoryWeights: Record<string, number>;
    tagSourceWeights: Record<TagSource, number>;
    expSubWeights: {
        industry: number;
        stage: number;
    };
    geoRegions: {
        center: { close: number; reasonable: number; far: number };
        north_south: { close: number; reasonable: number; far: number };
        jerusalem: { close: number; reasonable: number; far: number };
    };
    missingGeoScore: number; // 0 to 100
}

// Default configuration (synced with Admin Panel defaults)
const DEFAULT_CONFIG: MatchingConfig = {
    mainWeights: {
        vector: 0.25,
        tags: 0.40,
        geo: 0.20,
        experience: 0.15
    },
    tagCategoryWeights: {
        role: 100,
        seniority: 80,
        skill: 70,
        tool: 60,
        industry: 50,
        education: 40,
        language: 30,
        soft_skill: 20,
        certification: 20
    },
    tagSourceWeights: {
        [TagSource.RECRUITER]: 1.0,
        [TagSource.CANDIDATE]: 0.7,
        [TagSource.AI]: 0.5
    },
    expSubWeights: {
        industry: 60,
        stage: 40
    },
    geoRegions: {
        center: { close: 10, reasonable: 20, far: 35 },
        north_south: { close: 30, reasonable: 50, far: 80 },
        jerusalem: { close: 15, reasonable: 25, far: 45 }
    },
    missingGeoScore: 50 // Default to middle ground
};

/**
 * Main calculation function
 */
export async function calculateAdvancedMatch(
    candidate: any,
    job: any,
    config: MatchingConfig = DEFAULT_CONFIG
): Promise<{ score: number; candidate: any; job: any; breakdown: any }> {
    
    // 1. Vector Similarity (Simulated - in real app would call pgvector)
    const vectorScore = calculateVectorScore(candidate, job);

    // 2. Tag Layer Calculation
    const tagsScore = calculateTagsScore(candidate.tags, job.requirements.tags, config);

    // 3. Geo Layer Calculation
    let { score: geoScore, isMissing: geoMissing } = calculateGeoScore(candidate.location, job.location, config);

    // Handle Missing Geo Data with the new Scale Policy
    if (geoMissing) {
        geoScore = config.missingGeoScore;
    }

    // 4. Experience Layer Calculation
    const experienceScore = calculateExperienceScore(candidate, job, config);

    // --- Final Weighting ---
    const weights = { ...config.mainWeights };
    
    const finalScore = (vectorScore * weights.vector) + 
                 (tagsScore * weights.tags) + 
                 (geoScore * weights.geo) + 
                 (experienceScore * weights.experience);

    return {
        score: Math.round(finalScore),
        candidate,
        job,
        breakdown: {
            vector: Math.round(vectorScore),
            tags: Math.round(tagsScore),
            geo: Math.round(geoScore),
            geoMissing: geoMissing,
            experience: Math.round(experienceScore),
            appliedWeights: weights
        }
    };
}

/**
 * Layer 1: Vector Score
 * In a real implementation, this would be the Cosine Similarity from pgvector.
 */
function calculateVectorScore(candidate: any, job: any): number {
    // Mock logic: if candidate title matches job title, high score
    if (candidate.title?.toLowerCase() === job.title?.toLowerCase()) return 95;
    return 70; // Base semantic similarity for relevant candidates
}

/**
 * Layer 2: Tags Score
 * Incorporates Category Weights, Source Weights, and Confidence.
 */
function calculateTagsScore(candidateTags: Tag[], jobTags: Tag[], config: MatchingConfig): number {
    if (!jobTags || jobTags.length === 0) return 100;

    let totalWeightedScore = 0;
    let totalPossibleWeight = 0;

    jobTags.forEach(jobTag => {
        const categoryWeight = config.tagCategoryWeights[jobTag.category] || 10;
        const matchingCandidateTag = candidateTags.find(ct => ct.name === jobTag.name);

        if (matchingCandidateTag) {
            const sourceWeight = config.tagSourceWeights[matchingCandidateTag.source] || 0.5;
            const confidence = matchingCandidateTag.confidence || 0.8;
            
            // Score = (Proficiency * Source * Confidence)
            const tagMatchScore = (matchingCandidateTag.score || 100) * sourceWeight * confidence;
            
            totalWeightedScore += tagMatchScore * categoryWeight;
        }
        
        totalPossibleWeight += 100 * categoryWeight;
    });

    return totalPossibleWeight > 0 ? (totalWeightedScore / totalPossibleWeight) * 100 : 0;
}

/**
 * Layer 3: Geo Score
 * Regional logic: Center vs Periphery.
 */
function calculateGeoScore(candidateLoc: any, jobLoc: any, config: MatchingConfig): { score: number; isMissing: boolean } {
    if (!candidateLoc || !jobLoc) return { score: 0, isMissing: true };

    // 1. Determine Region (Simplified logic)
    const region = jobLoc.region === 'center' ? 'center' : 
                   jobLoc.region === 'jerusalem' ? 'jerusalem' : 'north_south';
    
    const thresholds = config.geoRegions[region];
    const distance = calculateDistance(candidateLoc, jobLoc);

    if (distance <= thresholds.close) return { score: 100, isMissing: false };
    if (distance <= thresholds.reasonable) return { score: 80, isMissing: false };
    if (distance <= thresholds.far) return { score: 40, isMissing: false };
    
    return { score: 0, isMissing: false };
}

/**
 * Layer 4: Experience & Career Stage Score
 * Industry alignment, Company Tier, and Age/Career Stage Fit.
 */
function calculateExperienceScore(candidate: any, job: any, config: MatchingConfig): number {
    let totalWeightedScore = 0;
    let totalPossibleWeight = 0;

    // 1. Industry Alignment
    const industryWeight = config.expSubWeights.industry;
    const hasSameIndustry = candidate.experience?.some((exp: any) => exp.industry === job.industry);
    if (hasSameIndustry) {
        totalWeightedScore += 100 * industryWeight;
    } else {
        totalWeightedScore += 30 * industryWeight; // Partial credit for any experience
    }
    totalPossibleWeight += 100 * industryWeight;

    // 2. Age / Career Stage Fit
    const stageWeight = config.expSubWeights.stage;
    let stageScore = 100;

    if (job.ageRange && candidate.age) {
        const { min, max } = job.ageRange;
        const age = candidate.age;
        
        if (age >= min && age <= max) {
            stageScore = 100;
        } else {
            const diff = age < min ? min - age : age - max;
            stageScore = Math.max(0, 100 - (diff * 10)); // Lose 10% for every year of deviation
        }
    }
    
    totalWeightedScore += stageScore * stageWeight;
    totalPossibleWeight += 100 * stageWeight;

    if (totalPossibleWeight === 0) return 0;

    // 3. Company Tier (Bonus points, not part of the main 100% weight to keep it simple)
    const hasHighTierCompany = candidate.experience?.some((exp: any) => exp.companyTier === 'tier_1');
    if (hasHighTierCompany) {
        totalWeightedScore += 10 * (industryWeight + stageWeight) / 2; // Small bonus
    }

    return Math.min((totalWeightedScore / totalPossibleWeight) * 100, 100);
}

/**
 * Helper: Haversine distance or simple Euclidean for demo
 */
function calculateDistance(loc1: any, loc2: any): number {
    // In real app: use coordinates. For now, mock distance.
    return loc1.distanceToJob || 25; 
}
