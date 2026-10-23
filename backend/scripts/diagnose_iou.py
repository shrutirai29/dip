import sys
import os
import json
import numpy as np

sys.path.insert(0, os.path.abspath("backend"))

from app.services.evaluation_service import evaluation_service, compute_box_iou, match_boxes_one_to_one

def main():
    print("==================================================================")
    print(" CROWDGUARD IoU Discrepancy & Per-Frame Diagnostic Evaluation     ")
    print("==================================================================")

    manifest = evaluation_service.load_manifest()
    detector = evaluation_service._get_detector()
    frames_meta = manifest.get("frames", [])
    print(f"Total Frames in Manifest: {len(frames_meta)}")

    all_matched_box_ious = []
    frame_mean_ious_non_empty = []
    frame_mean_ious_all_15 = []
    
    total_gt = 0
    total_pred = 0
    total_tp = 0
    total_fp = 0
    total_fn = 0

    print("\n-------------------------------------------------------------------------------------------------------------")
    print(f"{'Frame ID':<22} | {'Category':<15} | {'GT':<3} | {'Pred':<4} | {'TP':<3} | {'FP':<3} | {'FN':<3} | {'Frame IoU':<10} | {'Box IoUs'}")
    print("-------------------------------------------------------------------------------------------------------------")

    diagnostics = []

    for f in frames_meta:
        fid = f["frame_id"]
        cat = f.get("category", "")
        img_path = os.path.join("data/evaluation/frames", f.get("file_name", f"{fid}.jpg"))
        
        import cv2
        frame_bgr = cv2.imread(img_path)
        assert frame_bgr is not None, f"Image not found: {img_path}"
        h, w = frame_bgr.shape[:2]

        gts = f.get("ground_truth_boxes", [])
        raw_dets = detector.detect_persons(frame_bgr, imgsz=640, conf_threshold=0.30)
        match_res = match_boxes_one_to_one(raw_dets, gts, iou_threshold=0.50)

        tp = match_res["true_positives"]
        fp = match_res["false_positives"]
        fn = match_res["false_negatives"]
        box_ious = [m["iou"] for m in match_res["matches"]]

        all_matched_box_ious.extend(box_ious)
        if match_res["mean_iou"] > 0:
            frame_mean_ious_non_empty.append(match_res["mean_iou"])
        frame_mean_ious_all_15.append(match_res["mean_iou"])

        total_gt += len(gts)
        total_pred += len(raw_dets)
        total_tp += tp
        total_fp += fp
        total_fn += fn

        ious_str = ", ".join([f"{x:.3f}" for x in box_ious]) if box_ious else "None"
        print(f"{fid:<22} | {cat:<15} | {len(gts):<3} | {len(raw_dets):<4} | {tp:<3} | {fp:<3} | {fn:<3} | {match_res['mean_iou']:<10.4f} | {ious_str}")

        # Check out-of-bounds or invalid boxes
        invalid_boxes = []
        for b in raw_dets:
            bx1, by1, bx2, by2 = b["bbox"]
            if bx1 < 0 or by1 < 0 or bx2 > w or by2 > h or bx2 <= bx1 or by2 <= by1:
                invalid_boxes.append(b)

        diagnostics.append({
            "frame_id": fid,
            "category": cat,
            "resolution": [w, h],
            "ground_truth_count": len(gts),
            "predicted_count": len(raw_dets),
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "matched_ious": box_ious,
            "frame_mean_iou": match_res["mean_iou"],
            "invalid_boxes_count": len(invalid_boxes)
        })

    print("-------------------------------------------------------------------------------------------------------------")
    print(f"TOTALS: GT={total_gt}, Pred={total_pred}, TP={total_tp}, FP={total_fp}, FN={total_fn}")
    print(f"Precision: {total_tp / (total_tp + total_fp):.4f}")
    print(f"Recall:    {total_tp / (total_tp + total_fn):.4f}")
    print(f"F1 Score:  {2 * total_tp / (2 * total_tp + total_fp + total_fn):.4f}")
    print(f"\nIoU Metrics Analysis across {len(all_matched_box_ious)} matched boxes:")
    print(f"1. Micro-average (mean of all {len(all_matched_box_ious)} individual true-positive box IoUs): {np.mean(all_matched_box_ious):.4f} ({np.mean(all_matched_box_ious)*100:.2f}%)")
    print(f"2. Macro-average over non-empty frames (frames with TP > 0, N={len(frame_mean_ious_non_empty)}): {np.mean(frame_mean_ious_non_empty):.4f} ({np.mean(frame_mean_ious_non_empty)*100:.2f}%)")
    print(f"3. Macro-average over ALL 15 frames (treating empty frames as 0.0 IoU, N=15):                {np.mean(frame_mean_ious_all_15):.4f} ({np.mean(frame_mean_ious_all_15)*100:.2f}%)")
    
    # What if IoU for false positives and false negatives is penalized as 0.0?
    # Total entities = TP + FP + FN = 26 + 1 + 0 = 27
    penalized_ious = all_matched_box_ious + [0.0] * total_fp + [0.0] * total_fn
    print(f"4. Penalized IoU (all TP box IoUs + 0.0 for FP/FN, N={len(penalized_ious)}):                 {np.mean(penalized_ious):.4f} ({np.mean(penalized_ious)*100:.2f}%)")

    # Let's check min/max box IoUs
    print(f"5. Box IoU Range: min={np.min(all_matched_box_ious):.4f}, max={np.max(all_matched_box_ious):.4f}, median={np.median(all_matched_box_ious):.4f}")

    # Save detailed diagnostic JSON
    os.makedirs("data/reports", exist_ok=True)
    diag_file = "data/reports/iou_diagnostic_breakdown.json"
    with open(diag_file, "w", encoding="utf-8") as f:
        json.dump({
            "summary": {
                "total_ground_truth": total_gt,
                "total_predicted": total_pred,
                "true_positives": total_tp,
                "false_positives": total_fp,
                "false_negatives": total_fn,
                "precision": round(total_tp / (total_tp + total_fp), 4),
                "recall": round(total_tp / (total_tp + total_fn), 4),
                "f1_score": round(2 * total_tp / (2 * total_tp + total_fp + total_fn), 4),
                "micro_mean_iou_all_boxes": round(float(np.mean(all_matched_box_ious)), 4),
                "macro_mean_iou_non_empty_frames": round(float(np.mean(frame_mean_ious_non_empty)), 4),
                "macro_mean_iou_all_15_frames_with_zeros": round(float(np.mean(frame_mean_ious_all_15)), 4),
                "penalized_mean_iou_tp_fp_fn": round(float(np.mean(penalized_ious)), 4),
                "box_iou_min": round(float(np.min(all_matched_box_ious)), 4),
                "box_iou_max": round(float(np.max(all_matched_box_ious)), 4),
                "box_iou_median": round(float(np.median(all_matched_box_ious)), 4)
            },
            "per_frame_diagnostics": diagnostics
        }, f, indent=2)
    print(f"\nSaved detailed diagnostic breakdown to: {diag_file}")

if __name__ == "__main__":
    main()
