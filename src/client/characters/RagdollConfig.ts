/**
 * Ragdoll bone configuration for Mixamo character skeletons.
 * Defines physics collider dimensions (in cm, world space) and joint
 * constraints for each bone used in the ragdoll simulation.
 * @module client/characters/RagdollConfig
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { RagdollBoneProperties } from "@babylonjs/core/Physics/v2/ragdoll";
import { PhysicsConstraintType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";

/**
 * Extended config entry that includes the undeclared `bone` property
 * used by the Babylon.js Ragdoll implementation at runtime.
 */
export interface RagdollConfigEntry extends RagdollBoneProperties {
    /** Bone name (undeclared in .d.ts but required by the JS implementation). */
    bone?: string;
}

/** Default mass for ragdoll bodies (kg). */
export const RAGDOLL_MASS = 10;

/** Upward bias added to the hit direction so the body launches upward, not just sideways. */
export const RAGDOLL_UPWARD_BIAS = 0.5;

/**
 * 14-bone ragdoll configuration for a Mixamo skeleton.
 * Dimensions are in centimeters (world space).
 * `boxOffset` shifts the collider along the bone's local axis.
 */
export const RAGDOLL_BONE_CONFIG: RagdollConfigEntry[] = [
    // ── Torso ──
    {
        bone: "mixamorig:Hips",
        width: 30,
        height: 20,
        depth: 20,
        boxOffset: 0,
    },
    {
        bone: "mixamorig:Spine",
        width: 28,
        height: 18,
        depth: 18,
        joint: PhysicsConstraintType.HINGE,
        rotationAxis: Vector3.Right(),
        min: -0.35,
        max: 0.35,
        boxOffset: 10,
    },
    {
        bone: "mixamorig:Spine1",
        width: 28,
        height: 18,
        depth: 18,
        joint: PhysicsConstraintType.HINGE,
        rotationAxis: Vector3.Right(),
        min: -0.26,
        max: 0.26,
        boxOffset: 10,
    },
    {
        bone: "mixamorig:Spine2",
        width: 30,
        height: 20,
        depth: 18,
        joint: PhysicsConstraintType.HINGE,
        rotationAxis: Vector3.Right(),
        min: -0.26,
        max: 0.26,
        boxOffset: 10,
    },

    // ── Head / Neck ──
    {
        bone: "mixamorig:Neck",
        width: 12,
        height: 12,
        depth: 12,
        joint: PhysicsConstraintType.BALL_AND_SOCKET,
        min: -0.52,
        max: 0.52,
        boxOffset: 5,
    },
    {
        bone: "mixamorig:Head",
        width: 20,
        height: 20,
        depth: 20,
        joint: PhysicsConstraintType.BALL_AND_SOCKET,
        min: -0.44,
        max: 0.44,
        boxOffset: 10,
    },

    // ── Arms ──
    {
        bone: "mixamorig:LeftArm",
        width: 10,
        height: 28,
        depth: 10,
        joint: PhysicsConstraintType.BALL_AND_SOCKET,
        min: -1.57,
        max: 1.57,
        boxOffset: 14,
    },
    {
        bone: "mixamorig:RightArm",
        width: 10,
        height: 28,
        depth: 10,
        joint: PhysicsConstraintType.BALL_AND_SOCKET,
        min: -1.57,
        max: 1.57,
        boxOffset: 14,
    },
    {
        bone: "mixamorig:LeftForeArm",
        width: 8,
        height: 25,
        depth: 8,
        joint: PhysicsConstraintType.HINGE,
        rotationAxis: Vector3.Right(),
        min: 0,
        max: 2.27,
        boxOffset: 12,
    },
    {
        bone: "mixamorig:RightForeArm",
        width: 8,
        height: 25,
        depth: 8,
        joint: PhysicsConstraintType.HINGE,
        rotationAxis: Vector3.Right(),
        min: 0,
        max: 2.27,
        boxOffset: 12,
    },

    // ── Legs ──
    {
        bone: "mixamorig:LeftUpLeg",
        width: 14,
        height: 40,
        depth: 14,
        joint: PhysicsConstraintType.BALL_AND_SOCKET,
        min: -1.05,
        max: 1.05,
        boxOffset: 20,
        boneOffsetAxis: Vector3.Down(),
    },
    {
        bone: "mixamorig:RightUpLeg",
        width: 14,
        height: 40,
        depth: 14,
        joint: PhysicsConstraintType.BALL_AND_SOCKET,
        min: -1.05,
        max: 1.05,
        boxOffset: 20,
        boneOffsetAxis: Vector3.Down(),
    },
    {
        bone: "mixamorig:LeftLeg",
        width: 10,
        height: 38,
        depth: 10,
        joint: PhysicsConstraintType.HINGE,
        rotationAxis: Vector3.Right(),
        min: 0,
        max: 2.27,
        boxOffset: 19,
        boneOffsetAxis: Vector3.Down(),
    },
    {
        bone: "mixamorig:RightLeg",
        width: 10,
        height: 38,
        depth: 10,
        joint: PhysicsConstraintType.HINGE,
        rotationAxis: Vector3.Right(),
        min: 0,
        max: 2.27,
        boxOffset: 19,
        boneOffsetAxis: Vector3.Down(),
    },
];
